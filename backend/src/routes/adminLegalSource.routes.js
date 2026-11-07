import express from "express";

import {
    createLegalSource,
    getLegalSourceForStaff,
    listLegalSourcesForStaff,
    transitionLegalSource,
    updateLegalSource,
} from "../controllers/legalSource.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/", listLegalSourcesForStaff);
router.post("/", createLegalSource);
router.get("/:sourceId", getLegalSourceForStaff);
router.patch("/:sourceId", updateLegalSource);
// { action: "submit" | "retire", note? }
router.patch("/:sourceId/status", transitionLegalSource);

export default router;
