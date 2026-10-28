import "dotenv/config";

import app from "./app.js";
import { connectDatabase } from "./config/database.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        await connectDatabase();

        app.listen(PORT, () => {
            console.log(`Neve API running at http://localhost:${PORT}`);
            console.log(
                `Health check: http://localhost:${PORT}/api/v1/health`
            );
        });
    } catch (error) {
        console.error("Failed to start Neve:", error.message);
        process.exit(1);
    }
}

startServer();