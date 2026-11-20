// /api/v1/cron/:task
// Scheduled jobs on hosts without background timers (Vercel Cron); needs CRON_SECRET.
import { Router } from "../../../../../server/http/router.js";
import { apiRoutes } from "../../../../../server/http/route.js";
import { runCronTask } from "../../../../../server/controllers/cron.controller.js";

const router = Router();
router.get("/:task", runCronTask);

const handler = apiRoutes([{ prefix: "/api/v1/cron", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
