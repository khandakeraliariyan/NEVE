import express from "express";
import {
    listDocumentDeletionRequests,
    listRetentionDueDocuments,
    listSensitiveAccessLogs,
    reviewDocumentDeletionRequest,
    updateDocumentRetention,
} from "../controllers/privacy.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser, allowRoles("admin"));

router.get("/deletion-requests", listDocumentDeletionRequests);
router.patch("/deletion-requests/:requestId", reviewDocumentDeletionRequest);
router.get("/retention-due", listRetentionDueDocuments);
router.patch("/files/:fileId/retention", updateDocumentRetention);
router.get("/access-logs", listSensitiveAccessLogs);

export default router;
