// Restores a database backup from object storage.
//   npm run restore-backup -- --list
//   npm run restore-backup -- --id <backupId> --confirm [--drop]
// Without --drop, collections that already have documents are skipped.
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { backupBucket, listBackupIds, restoreBackup } from "../src/services/backup.service.js";

const arg = (name) => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

try {
    if (flag("list")) {
        console.log((await listBackupIds(backupBucket())).join("\n") || "No backups found.");
    } else {
        const id = arg("id");
        if (!id || !flag("confirm")) {
            console.error("Usage: npm run restore-backup -- --id <backupId> --confirm [--drop]");
            process.exitCode = 1;
        } else {
            await connectDatabase();
            const result = await restoreBackup({ id, drop: flag("drop") });
            console.log(JSON.stringify(result, null, 2));
        }
    }
} catch (error) {
    console.error("Restore failed:", error.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
