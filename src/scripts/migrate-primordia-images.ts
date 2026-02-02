import "dotenv/config";
import mongoose from "mongoose";
import { ImageModel } from "imagelib/schemas";
import { IMAGE_STATUS } from "imagelib";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import mime from "mime-types";

/**
 * Migrates all images from the Primordia application into the image-service.
 *
 * Usage:
 *   npx ts-node src/scripts/migrate-primordia-images.ts <primordiaMongoUri> <primordiaImageDir> <appName>
 *
 * Arguments:
 *   primordiaMongoUri  - MongoDB connection string for the Primordia database
 *   primordiaImageDir  - Absolute path to Primordia's image directory (e.g. C:\...\primordia-vite\public\images)
 *   appName            - The AppID to use in the image-service (must match an existing API key AppName)
 *
 * Environment (from .env):
 *   MONGODB_URI  - MongoDB connection string for the image-service database
 *   IMAGE_DIR    - Image-service storage directory
 *
 * Example:
 *   npx ts-node src/scripts/migrate-primordia-images.ts "mongodb+srv://..." "C:\Users\aqxau\codebase\primordia-vite\public\images" primordia
 */

interface MigrationResult {
    originalFilename: string;
    imageID: string;
    newFilename: string;
    source: "player" | "character" | "orphan";
    sourceID?: number;
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml"
    };
    return mimeMap[ext] || mime.lookup(filePath) || "application/octet-stream";
}

function printUsage() {
    console.log("Usage: npx ts-node src/scripts/migrate-primordia-images.ts <primordiaMongoUri> <primordiaImageDir> <appName>");
    console.log("");
    console.log("  primordiaMongoUri  - MongoDB URI for the Primordia database");
    console.log("  primordiaImageDir  - Path to Primordia's image directory");
    console.log("  appName            - AppID to assign in image-service");
    console.log("");
    console.log("Env vars (from .env):");
    console.log("  MONGODB_URI  - Image-service MongoDB URI");
    console.log("  IMAGE_DIR    - Image-service storage path");
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        printUsage();
        process.exit(1);
    }

    const [primordiaMongoUri, primordiaImageDir, appName] = args;
    const imageServiceDir = path.resolve(process.env.IMAGE_DIR || "./uploads");
    const appDir = path.join(imageServiceDir, appName);

    // Validate source directory
    if (!fs.existsSync(primordiaImageDir)) {
        console.error(`Primordia image directory not found: ${primordiaImageDir}`);
        process.exit(1);
    }

    // Create destination directory
    if (!fs.existsSync(appDir)) {
        fs.mkdirSync(appDir, { recursive: true });
    }

    // ── Connect to both databases ──────────────────────────────────────
    // Image-service DB (default mongoose connection)
    const imageServiceConn = await mongoose.connect(process.env.MONGODB_URI || "");
    // Primordia DB (separate connection)
    const primordiaConn = await mongoose.createConnection(primordiaMongoUri).asPromise();

    console.log("Connected to both databases.\n");

    // ── Step 1: Gather all image references from Primordia DB ──────────
    const playerCollection = primordiaConn.collection("player");
    const characterCollection = primordiaConn.collection("character");

    const players = await playerCollection.find(
        { AvatarURL: { $exists: true, $nin: [null, ""] } },
        { projection: { UserID: 1, AvatarURL: 1 } }
    ).toArray();

    const characters = await characterCollection.find(
        { Avatar: { $exists: true, $nin: [null, ""] } },
        { projection: { CharacterID: 1, Avatar: 1 } }
    ).toArray();

    console.log(`Found ${players.length} players with avatars`);
    console.log(`Found ${characters.length} characters with avatars`);

    // Build a set of all referenced filenames
    const referencedFiles = new Map<string, { source: "player" | "character"; sourceID: number }>();

    for (const p of players) {
        if (p.AvatarURL) {
            referencedFiles.set(p.AvatarURL, { source: "player", sourceID: p.UserID });
        }
    }
    for (const c of characters) {
        if (c.Avatar) {
            referencedFiles.set(c.Avatar, { source: "character", sourceID: c.CharacterID });
        }
    }

    // ── Step 2: Scan disk for all image files ──────────────────────────
    const allFilesOnDisk = fs.readdirSync(primordiaImageDir).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext);
    });

    console.log(`Found ${allFilesOnDisk.length} image files on disk`);

    // Categorize: referenced vs orphan
    const referencedOnDisk: string[] = [];
    const orphanFiles: string[] = [];

    for (const file of allFilesOnDisk) {
        if (referencedFiles.has(file)) {
            referencedOnDisk.push(file);
        } else {
            orphanFiles.push(file);
        }
    }

    // Check for references that are missing on disk
    const missingFromDisk: string[] = [];
    for (const [filename] of referencedFiles) {
        if (!allFilesOnDisk.includes(filename)) {
            missingFromDisk.push(filename);
        }
    }

    console.log(`  Referenced & on disk: ${referencedOnDisk.length}`);
    console.log(`  Orphan files (on disk but not in DB): ${orphanFiles.length}`);
    console.log(`  Missing files (in DB but not on disk): ${missingFromDisk.length}`);
    if (missingFromDisk.length > 0) {
        console.log(`  Missing: ${missingFromDisk.join(", ")}`);
    }
    console.log("");

    // ── Step 3 & 4: Create image records and copy files ────────────────
    const results: MigrationResult[] = [];
    const playerUpdates: { userID: number; imageID: string }[] = [];
    const characterUpdates: { characterID: number; imageID: string }[] = [];

    // Process referenced files first
    for (const filename of referencedOnDisk) {
        const ref = referencedFiles.get(filename);
        const result = await migrateFile(filename, primordiaImageDir, appDir, appName, ref.source, ref.sourceID);
        results.push(result);

        if (ref.source === "player") {
            playerUpdates.push({ userID: ref.sourceID, imageID: result.imageID });
        } else {
            characterUpdates.push({ characterID: ref.sourceID, imageID: result.imageID });
        }
    }

    // Process orphan files (on disk but not referenced in DB)
    for (const filename of orphanFiles) {
        const result = await migrateFile(filename, primordiaImageDir, appDir, appName, "orphan");
        results.push(result);
    }

    console.log(`\nMigrated ${results.length} images to image-service.`);

    // ── Step 5: Update Primordia database references ───────────────────
    console.log(`\nUpdating ${playerUpdates.length} player records...`);
    for (const update of playerUpdates) {
        await playerCollection.updateOne(
            { UserID: update.userID },
            { $set: { AvatarURL: update.imageID } }
        );
    }

    console.log(`Updating ${characterUpdates.length} character records...`);
    for (const update of characterUpdates) {
        await characterCollection.updateOne(
            { CharacterID: update.characterID },
            { $set: { Avatar: update.imageID } }
        );
    }

    // ── Summary ────────────────────────────────────────────────────────
    const playerCount = results.filter(r => r.source === "player").length;
    const characterCount = results.filter(r => r.source === "character").length;
    const orphanCount = results.filter(r => r.source === "orphan").length;

    console.log("\n=== Migration Complete ===");
    console.log(`  Player avatars:    ${playerCount}`);
    console.log(`  Character avatars: ${characterCount}`);
    console.log(`  Orphan files:      ${orphanCount}`);
    console.log(`  Total migrated:    ${results.length}`);
    console.log(`  Destination:       ${appDir}`);
    console.log(`  Missing (skipped): ${missingFromDisk.length}`);

    await primordiaConn.close();
    await imageServiceConn.disconnect();
    process.exit(0);
}

async function migrateFile(
    filename: string,
    sourceDir: string,
    destDir: string,
    appName: string,
    source: "player" | "character" | "orphan",
    sourceID?: number
): Promise<MigrationResult> {
    const sourcePath = path.join(sourceDir, filename);
    const stat = fs.statSync(sourcePath);
    const mimeType = getMimeType(sourcePath);
    const ext = path.extname(filename);

    const imageID = crypto.randomUUID();
    const newFilename = `${imageID}${ext}`;
    const destPath = path.join(destDir, newFilename);

    // Copy the file
    fs.copyFileSync(sourcePath, destPath);

    // Determine tags based on source
    const tags: string[] = [];
    if (source === "player") {
        tags.push("player-avatar");
        if (sourceID !== undefined) tags.push(`player:${sourceID}`);
    } else if (source === "character") {
        tags.push("character-avatar");
        if (sourceID !== undefined) tags.push(`character:${sourceID}`);
    } else {
        tags.push("orphan");
        // Try to extract category from legacy naming (e.g. "Generic_5.png" -> "generic")
        const match = filename.match(/^([A-Za-z]+)_/);
        if (match) tags.push(match[1].toLowerCase());
    }

    // Create image record in image-service DB
    const image = new ImageModel({
        ImageID: imageID,
        AppID: appName,
        FileName: newFilename,
        OriginalFileName: filename,
        MimeType: mimeType,
        Size: stat.size,
        Tags: tags,
        Description: "",
        Alt: "",
        Status: IMAGE_STATUS.ACTIVE,
        UploadedBy: "migration"
    });
    await image.save();

    return { originalFilename: filename, imageID, newFilename, source, sourceID };
}

main().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
