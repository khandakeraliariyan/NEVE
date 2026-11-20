// /api/v1/auth/...
import { Router } from "../../../../../server/http/router.js";
import { adminLogin, adminLogout, getCurrentUser, reportPasswordChanged } from "../../../../../server/controllers/auth.controller.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { completeAdminSetup } from "../../../../../server/controllers/adminStaff.controller.js";
import { apiRoutes } from "../../../../../server/http/route.js";
import { authLimiter } from "../../../../../server/middleware/rateLimit.middleware.js";

const router = Router();

router.get("/me", authenticateUser, getCurrentUser);
router.post("/password-changed", authenticateUser, reportPasswordChanged);
// Rate limited by authLimiter, applied to all of /api/v1/auth in app.js.
router.post("/admin/login", adminLogin);
router.post("/admin/logout", adminLogout);
// A new admin chooses their password with a one-time link (no sign-in).
router.post("/admin/setup", completeAdminSetup);

const handler = apiRoutes([{ prefix: "/api/v1/auth", middleware: [authLimiter], router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
