import "dotenv/config";
import { connect, ApiKeyModel } from "imagelib/schemas";

function printUsage() {
    console.log("Usage: npx ts-node src/scripts/revoke-api-key.ts <apiKeyID>");
    console.log("");
    console.log("Examples:");
    console.log("  npx ts-node src/scripts/revoke-api-key.ts 1000");
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        printUsage();
        process.exit(1);
    }

    const apiKeyID = parseInt(args[0]);
    if (isNaN(apiKeyID)) {
        console.error("apiKeyID must be a number");
        process.exit(1);
    }

    await connect(process.env.MONGODB_URI);

    const result = await ApiKeyModel.updateOne(
        { ApiKeyID: apiKeyID },
        { $set: { Active: false } }
    );

    if (result.matchedCount === 0) {
        console.error(`API key ${apiKeyID} not found.`);
        process.exit(1);
    }

    console.log(`API key ${apiKeyID} has been revoked.`);
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
