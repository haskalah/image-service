import "dotenv/config";
import { connect, ApiKeyModel } from "imagelib/schemas";
import { API_KEY_PERMISSIONS, IApiKey } from "imagelib";

async function main() {
    await connect(process.env.MONGODB_URI);

    const keys = await ApiKeyModel.find({}).select("-Key").sort({ createdAt: -1 }) as IApiKey[];

    if (keys.length === 0) {
        console.log("No API keys found.");
        process.exit(0);
    }

    console.log(`Found ${keys.length} API key(s):\n`);

    for (const key of keys) {
        const perms = [];
        if (key.Permissions & API_KEY_PERMISSIONS.READ) perms.push("READ");
        if (key.Permissions & API_KEY_PERMISSIONS.WRITE) perms.push("WRITE");
        if (key.Permissions & API_KEY_PERMISSIONS.DELETE) perms.push("DELETE");
        if (key.Permissions & API_KEY_PERMISSIONS.ADMIN) perms.push("ADMIN");

        console.log(`  [${key.ApiKeyID}] ${key.AppName}`);
        console.log(`    Active: ${key.Active}`);
        console.log(`    Permissions: ${perms.join(", ")}`);
        console.log(`    Created: ${key.createdAt}`);
        console.log("");
    }

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
