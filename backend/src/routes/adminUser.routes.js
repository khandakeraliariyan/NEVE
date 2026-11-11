import express from "express";
import { createStaffAccount, renewAdminSetupLink } from "../controllers/adminStaff.controller.js";

import {
    changeAccountStatus,
    changeReviewerRole,
    listUsers,
} from "../controllers/adminUser.controller.js";
import { decideAppeal, listAppeals } from "../controllers/accountAppeal.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/", listUsers);
// Account appeals and complaints (registered before /:userId routes).
router.get("/appeals", listAppeals);
router.patch("/appeals/:appealId", decideAppeal);
router.post("/staff", createStaffAccount);
router.post("/:userId/setup-link", renewAdminSetupLink);
router.patch("/:userId/role", changeReviewerRole);
router.patch("/:userId/status", changeAccountStatus);

export default router;
