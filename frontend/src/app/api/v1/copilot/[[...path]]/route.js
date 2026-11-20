// /api/v1/copilot/...
import { Router } from "../../../../../server/http/router.js";

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
} from "../../../../../server/controllers/legalCopilot.controller.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { copilotLimiter } from "../../../../../server/middleware/rateLimit.middleware.js";
import { allowRoles, requirePermission } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

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

const handler = apiRoutes([{ prefix: "/api/v1/copilot", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
