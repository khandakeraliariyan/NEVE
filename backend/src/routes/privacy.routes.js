import express from "express";
import {
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
        "mediator",
        "legal_reviewer",
        "admin"
    )
);

router.get("/export", exportMyData);
router.get("/documents", listMyDeletableDocuments);
router.get("/documents/deletion-requests", listMyDocumentDeletionRequests);
router.post("/documents/:fileId/deletion-requests", requestDocumentDeletion);

export default router;
