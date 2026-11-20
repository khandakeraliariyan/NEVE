// /api/v1/privacy/...
import { Router } from "../../../../../server/http/router.js";
import {
    deleteMyAccount,
    getAccountDeletionInfo,
    exportMyData,
    listMyDeletableDocuments,
    listMyDocumentDeletionRequests,
    requestDocumentDeletion,
} from "../../../../../server/controllers/privacy.controller.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

router.use(
    authenticateUser,
    allowRoles(
        "renter",
        "landlord",
        "legal_reviewer",
        "admin"
    )
);

router.get("/export", exportMyData);
router.get("/account-deletion", getAccountDeletionInfo);
router.post("/account-deletion", deleteMyAccount);
router.get("/documents", listMyDeletableDocuments);
router.get("/documents/deletion-requests", listMyDocumentDeletionRequests);
router.post("/documents/:fileId/deletion-requests", requestDocumentDeletion);

const handler = apiRoutes([{ prefix: "/api/v1/privacy", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
