import express from "express";

import {
    getPlatformSettings,
    listEmailTemplates,
    previewEmailTemplate,
    resetEmailTemplate,
    updateEmailTemplate,
    updatePlatformSettings,
} from "../controllers/platformSettings.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/settings", getPlatformSettings);
router.patch("/settings", updatePlatformSettings);
router.get("/email-templates", listEmailTemplates);
router.put("/email-templates/:type", updateEmailTemplate);
router.delete("/email-templates/:type", resetEmailTemplate);
router.post("/email-templates/:type/preview", previewEmailTemplate);

export default router;
