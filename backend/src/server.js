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