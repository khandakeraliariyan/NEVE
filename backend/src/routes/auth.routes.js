import { Router } from "express";
import { adminLogin, getCurrentUser, reportPasswordChanged } from "../controllers/auth.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { completeAdminSetup } from "../controllers/adminStaff.controller.js";

const router = Router();

router.get("/me", authenticateUser, getCurrentUser);
router.post("/password-changed", authenticateUser, reportPasswordChanged);
// Rate limited by authLimiter, applied to all of /api/v1/auth in app.js.
router.post("/admin/login", adminLogin);
// A new admin chooses their password with a one-time link (no sign-in).
router.post("/admin/setup", completeAdminSetup);

export default router;
