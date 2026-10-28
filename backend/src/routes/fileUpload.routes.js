import express from "express";

import {
    requestUploadUrl,
    completeUpload,
    getFileAccessUrl,
} from "../controllers/fileUpload.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authenticateUser);

router.post("/presign", requestUploadUrl);
router.patch("/:fileId/complete", completeUpload);
router.get("/:fileId/access-url", getFileAccessUrl);

export default router;