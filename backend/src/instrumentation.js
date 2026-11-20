// Next.js calls register() once when the API server starts.
//
// On a long-running server (`npm start`, `npm run dev`) the background jobs
// run on timers started here. On Vercel there are no background timers:
// Vercel Cron calls /api/v1/cron/:task instead (see vercel.json and
// controllers/cron.controller.js). Either way every API request opens the
// database connection if needed (see http/route.js).
export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    const { recordSystemError } = await import("./services/systemErrors.service.js");
    // Keep crashes outside a request visible to admins too.
    process.on("unhandledRejection", (reason) => {
        console.error("Unhandled rejection:", reason);
        recordSystemError({ error: reason instanceof Error ? reason : new Error(String(reason)), source: "process" });
    });

    if (process.env.VERCEL) return;

    const { connectDatabase } = await import("./config/database.js");
    const { startScheduledJobs } = await import("./services/systemJobs.service.js");
    try {
        await connectDatabase();
    } catch (error) {
        // Requests and the driver retry the connection, so the API keeps
        // running; each job tick skips while the database is unreachable.
        console.error("Neve couldn't connect to the database at startup:", error.message ?? error);
    }
    startScheduledJobs();
}
