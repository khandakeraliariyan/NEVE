import { Router } from "express";
import { adminLogin, getCurrentUser } from "../controllers/auth.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/me", authenticateUser, getCurrentUser);
// Rate limited by authLimiter, applied to all of /api/v1/auth in app.js.
router.post("/admin/login", adminLogin);

export default router;
