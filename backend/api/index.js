// Vercel entry point. vercel.json sends every request here, and the Express
// app handles it exactly as it does under src/server.js. Differences from a
// long-running server:
// - the database connection is opened on the first request of each instance
//   and reused while the instance stays warm;
// - platform settings are re-read when their cache expires, instead of on a
//   timer;
// - scheduled jobs run through Vercel Cron calling /api/v1/cron/:task
//   (see vercel.json and controllers/cron.controller.js), not on timers.
import app from "../src/app.js";
import { connectDatabase } from "../src/config/database.js";
import { getSettings } from "../src/services/platformSettings.service.js";

export default async function handler(req, res) {
    // CORS preflights and the health check don't need the database.
    const needsDatabase = req.method !== "OPTIONS" && !req.url.startsWith("/api/v1/health");
    if (needsDatabase) {
        try {
            await connectDatabase();
            await getSettings();
        } catch (error) {
            console.error("Database unavailable:", error.message ?? error);
            res.statusCode = 503;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: false, message: "The service is temporarily unavailable. Please try again shortly." }));
            return;
        }
    }
    return app(req, res);
}
