// /api/v1/admin/users/...
import { Router } from "../../../../../../server/http/router.js";
import { createStaffAccount, renewAdminSetupLink } from "../../../../../../server/controllers/adminStaff.controller.js";

import {
    changeAccountStatus,
    changeReviewerRole,
    listUsers,
} from "../../../../../../server/controllers/adminUser.controller.js";
import { decideAppeal, listAppeals } from "../../../../../../server/controllers/accountAppeal.controller.js";
import { authenticateUser } from "../../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/", listUsers);
// Account appeals and complaints (registered before /:userId routes).
router.get("/appeals", listAppeals);
router.patch("/appeals/:appealId", decideAppeal);
router.post("/staff", createStaffAccount);
router.post("/:userId/setup-link", renewAdminSetupLink);
router.patch("/:userId/role", changeReviewerRole);
router.patch("/:userId/status", changeAccountStatus);

const handler = apiRoutes([{ prefix: "/api/v1/admin/users", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
