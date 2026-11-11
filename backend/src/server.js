import { env } from "./config/env.js";
import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { startScheduledJobs } from "./services/systemJobs.service.js";
import { keepSettingsFresh } from "./services/platformSettings.service.js";
import { recordSystemError } from "./services/systemErrors.service.js";

// Keep crashes outside a request visible to admins too.
process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason);
    recordSystemError({ error: reason instanceof Error ? reason : new Error(String(reason)), source: "process" });
});

// After an uncaught exception the process state can't be trusted, so record
// it (waiting at most 3 seconds) and exit for the process manager to restart.
process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000).unref());
    Promise.race([recordSystemError({ error, source: "process", status: null }), timeout]).finally(() => process.exit(1));
});

async function startServer() {
    try {
        await connectDatabase();
        startScheduledJobs();
        keepSettingsFresh();

        app.listen(env.PORT, () => {
            console.log(`Neve API running at http://localhost:${env.PORT}`);
            console.log(
                `Health check: http://localhost:${env.PORT}/api/v1/health`
            );
        });
    } catch (error) {
        console.error("Failed to start Neve:", error.message);
        process.exit(1);
    }
}

startServer();