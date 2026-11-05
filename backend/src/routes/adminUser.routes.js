import express from "express";

import {
    changeReviewerRole,
    listUsers,
} from "../controllers/adminUser.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/", listUsers);
router.patch("/:userId/role", changeReviewerRole);

export default router;
