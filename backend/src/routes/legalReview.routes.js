import express from "express";

import {
    getLegalSourceForStaff,
    listLegalSourcesForStaff,
    transitionLegalSource,
} from "../controllers/legalSource.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("legal_reviewer"));

// Legal reviewers see sources (use ?status=in_review for the queue) and
// approve them or send them back with notes.
router.get("/sources", listLegalSourcesForStaff);
router.get("/sources/:sourceId", getLegalSourceForStaff);
// { action: "approve" | "request_changes", note? }
router.patch("/sources/:sourceId", transitionLegalSource);

export default router;
