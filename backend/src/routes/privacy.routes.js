import express from "express";
import {
    deleteMyAccount,
    getAccountDeletionInfo,
    exportMyData,
    listMyDeletableDocuments,
    listMyDocumentDeletionRequests,
    requestDocumentDeletion,
} from "../controllers/privacy.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

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

export default router;
