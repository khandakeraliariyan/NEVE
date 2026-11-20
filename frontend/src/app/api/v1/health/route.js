// /api/v1/health
import { Router } from "../../../../server/http/router.js";
import { apiRoutes } from "../../../../server/http/route.js";

const router = Router();
router.get("/", (req, res) => res.status(200).json({ success: true, message: "Neve API is running" }));

const handler = apiRoutes([{ prefix: "/api/v1/health", router }]);

export const dynamic = "force-dynamic";
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
