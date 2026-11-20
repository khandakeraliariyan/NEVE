// /api/v1/saved-searches/...
import { Router } from "../../../../../server/http/router.js";
import {
    createSavedSearch,
    deleteSavedSearch,
    getSavedSearch,
    listSavedSearches,
    updateSavedSearch,
} from "../../../../../server/controllers/savedSearch.controller.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
});
router.use(authenticateUser, allowRoles("renter"));

router.get("/", listSavedSearches);
router.post("/", createSavedSearch);
router.get("/:searchId", getSavedSearch);
router.patch("/:searchId", updateSavedSearch);
router.delete("/:searchId", deleteSavedSearch);

const handler = apiRoutes([{ prefix: "/api/v1/saved-searches", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
