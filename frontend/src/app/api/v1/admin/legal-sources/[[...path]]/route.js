// /api/v1/admin/legal-sources/...
import { Router } from "../../../../../../server/http/router.js";

import {
    createLegalSource,
    getLegalSourceForStaff,
    listLegalSourcesForStaff,
    resolveLegalSourceFlag,
    transitionLegalSource,
    updateLegalSource,
    getOutdatedCitations,
    assignLegalSource,
    getReviewerActivity,
} from "../../../../../../server/controllers/legalSource.controller.js";
import { authenticateUser } from "../../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/outdated-citations", getOutdatedCitations);
router.get("/reviewer-activity", getReviewerActivity);
router.get("/", listLegalSourcesForStaff);
router.post("/", createLegalSource);
router.get("/:sourceId", getLegalSourceForStaff);
router.patch("/:sourceId", updateLegalSource);
// { action: "submit" | "retire", note? }
router.patch("/:sourceId/status", transitionLegalSource);
router.patch("/:sourceId/assignment", assignLegalSource);
router.patch("/:sourceId/flags/:flagId", resolveLegalSourceFlag);

const handler = apiRoutes([{ prefix: "/api/v1/admin/legal-sources", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
