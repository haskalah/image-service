import "dotenv/config";
import { connect, ApiKeyModel } from "imagelib/schemas";
import { API_KEY_PERMISSIONS } from "imagelib";
import crypto from "crypto";

const PERMISSION_NAMES: Record<string, number> = {
    read: API_KEY_PERMISSIONS.READ,
    write: API_KEY_PERMISSIONS.WRITE,
    delete: API_KEY_PERMISSIONS.DELETE,
    admin: API_KEY_PERMISSIONS.ADMIN
};

function printUsage() {
    console.log("Usage: npx ts-node src/scripts/create-api-key.ts <appName> [permissions...]");
    console.log("");
    console.log("Permissions: read, write, delete, admin (default: read,write)");
    console.log("");
    console.log("Examples:");
    console.log("  npx ts-node src/scripts/create-api-key.ts myapp");
    console.log("  npx ts-node src/scripts/create-api-key.ts myapp read write delete");
    console.log("  npx ts-node src/scripts/create-api-key.ts admin read write delete admin");
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        printUsage();
        process.exit(1);
    }

    const appName = args[0];
    const permArgs = args.slice(1);

    let permissions = 0;
    if (permArgs.length === 0) {
        permissions = API_KEY_PERMISSIONS.READ | API_KEY_PERMISSIONS.WRITE;
    } else {
        for (const p of permArgs) {
            const val = PERMISSION_NAMES[p.toLowerCase()];
            if (val === undefined) {
                console.error(`Unknown permission: ${p}`);
                console.error(`Valid permissions: ${Object.keys(PERMISSION_NAMES).join(", ")}`);
                process.exit(1);
            }
            permissions |= val;
        }
    }

    await connect(process.env.MONGODB_URI);

    const existing = await ApiKeyModel.findOne({ AppName: appName, Active: true });
    if (existing) {
        console.error(`An active API key already exists for "${appName}". Revoke it first.`);
        process.exit(1);
    }

    const rawKey = `img_${crypto.randomBytes(32).toString("hex")}`;
    const hashedKey = crypto.createHash("sha256").update(rawKey).digest("hex");

    const apiKey = new ApiKeyModel({
        AppName: appName,
        Key: hashedKey,
        Permissions: permissions,
        Active: true
    });
    await apiKey.save();

    const permList = Object.entries(PERMISSION_NAMES)
        .filter(([_, v]) => (permissions & v) !== 0)
        .map(([k]) => k.toUpperCase());

    console.log(`API key created for "${appName}"`);
    console.log(`Permissions: ${permList.join(", ")}`);
    console.log(`Raw key (save this, it won't be shown again):\n  ${rawKey}`);

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
