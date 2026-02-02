import "dotenv/config";
import { connect, ApiKeyModel } from "imagelib/schemas";
import { API_KEY_PERMISSIONS } from "imagelib";

const PERMISSION_NAMES: Record<string, number> = {
    read: API_KEY_PERMISSIONS.READ,
    write: API_KEY_PERMISSIONS.WRITE,
    delete: API_KEY_PERMISSIONS.DELETE,
    admin: API_KEY_PERMISSIONS.ADMIN
};

function printUsage() {
    console.log("Usage: npx ts-node src/scripts/update-api-key.ts <apiKeyID> <permissions...>");
    console.log("");
    console.log("Permissions: read, write, delete, admin");
    console.log("");
    console.log("Examples:");
    console.log("  npx ts-node src/scripts/update-api-key.ts 1000 read write");
    console.log("  npx ts-node src/scripts/update-api-key.ts 1001 read write delete admin");
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        printUsage();
        process.exit(1);
    }

    const apiKeyID = parseInt(args[0]);
    if (isNaN(apiKeyID)) {
        console.error("apiKeyID must be a number");
        process.exit(1);
    }

    let permissions = 0;
    for (const p of args.slice(1)) {
        const val = PERMISSION_NAMES[p.toLowerCase()];
        if (val === undefined) {
            console.error(`Unknown permission: ${p}`);
            console.error(`Valid permissions: ${Object.keys(PERMISSION_NAMES).join(", ")}`);
            process.exit(1);
        }
        permissions |= val;
    }

    await connect(process.env.MONGODB_URI);

    const result = await ApiKeyModel.updateOne(
        { ApiKeyID: apiKeyID },
        { $set: { Permissions: permissions } }
    );

    if (result.matchedCount === 0) {
        console.error(`API key ${apiKeyID} not found.`);
        process.exit(1);
    }

    const permList = Object.entries(PERMISSION_NAMES)
        .filter(([_, v]) => (permissions & v) !== 0)
        .map(([k]) => k.toUpperCase());

    console.log(`API key ${apiKeyID} updated. New permissions: ${permList.join(", ")}`);
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
