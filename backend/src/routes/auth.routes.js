import { Router } from "express";
import { getCurrentUser } from "../controllers/auth.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/me", authenticateUser, getCurrentUser);

export default router;