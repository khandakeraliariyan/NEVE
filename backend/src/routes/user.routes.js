import { Router } from "express";

import {
    createProfile,
    getMyProfile,
} from "../controllers/user.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/profile", authenticateUser, createProfile);
router.get("/me", authenticateUser, getMyProfile);

export default router;