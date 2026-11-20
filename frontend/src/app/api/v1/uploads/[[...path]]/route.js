// /api/v1/uploads/...
import { Router } from "../../../../../server/http/router.js";

import {
    requestUploadUrl,
    completeUpload,
    getFileAccessUrl,
} from "../../../../../server/controllers/fileUpload.controller.js";

import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";
import { uploadLimiter } from "../../../../../server/middleware/rateLimit.middleware.js";

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

router.post("/presign", requestUploadUrl);
router.patch("/:fileId/complete", completeUpload);
router.get("/:fileId/access-url", getFileAccessUrl);


const handler = apiRoutes([{ prefix: "/api/v1/uploads", middleware: [uploadLimiter], router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
