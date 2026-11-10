import express from "express";

import {
    askQuestion,
    createConversation,
    deleteConversation,
    exportConversationText,
    getCitedSection,
    getConversation,
    listConversations,
    renameConversation,
    reportAnswer,
} from "../controllers/legalCopilot.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { copilotLimiter } from "../middleware/rateLimit.middleware.js";
import { allowRoles, requirePermission } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser, allowRoles("renter", "landlord", "legal_reviewer"));
router.use(
    requirePermission(
        (settings, user) => (settings.rolePermissions.copilotRoles ?? []).includes(user.role),
        "Legal Copilot isn't available for your role."
    )
);

router.get("/sources/:legalSourceId/sections/:sectionId", getCitedSection);
router.get("/conversations", listConversations);
router.post("/conversations", createConversation);
router.get("/conversations/:conversationId", getConversation);
router.patch("/conversations/:conversationId", renameConversation);
router.delete("/conversations/:conversationId", deleteConversation);
router.get("/conversations/:conversationId/export", exportConversationText);
router.post("/conversations/:conversationId/messages", copilotLimiter, askQuestion);
router.patch("/conversations/:conversationId/messages/:messageId/report", reportAnswer);

export default router;
