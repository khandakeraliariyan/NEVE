// /api/v1/platform/...
// Public: announcement banner, sign-up options and the privacy policy.
import { Router } from "../../../../../server/http/router.js";
import { apiRoutes } from "../../../../../server/http/route.js";
import { getPrivacyPolicy, getPublicPlatformInfo } from "../../../../../server/controllers/platformSettings.controller.js";

const router = Router();
router.get("/", getPublicPlatformInfo);
router.get("/privacy-policy", getPrivacyPolicy);

const handler = apiRoutes([{ prefix: "/api/v1/platform", router }]);

export const dynamic = "force-dynamic";
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
