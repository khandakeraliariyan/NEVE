// Backs up the database to object storage now: npm run backup
import mongoose from "mongoose";
import { connectDatabase } from "../src/server/config/database.js";
import { runSystemJob } from "../src/server/services/systemJobs.service.js";

try {
    await connectDatabase();
    const run = await runSystemJob("backup", { trigger: "manual" });
    if (!run) {
        console.error("A backup is already running.");
        process.exitCode = 1;
    } else {
        console.log(JSON.stringify({ status: run.status, summary: run.summary, error: run.error }, null, 2));
        if (run.status !== "completed") process.exitCode = 1;
    }
} catch (error) {
    console.error("Backup failed:", error.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
