import { env } from "./config/env.js";
import app from "./app.js";
import { connectDatabase } from "./config/database.js";

async function startServer() {
    try {
        await connectDatabase();

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