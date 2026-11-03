import express from "express";

import {
    requestUploadUrl,
    completeUpload,
    getFileAccessUrl,
} from "../controllers/fileUpload.controller.js";

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

router.post("/presign", requestUploadUrl);
router.patch("/:fileId/complete", completeUpload);
router.get("/:fileId/access-url", getFileAccessUrl);

export default router;