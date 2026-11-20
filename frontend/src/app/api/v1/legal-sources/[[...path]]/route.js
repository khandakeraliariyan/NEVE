// /api/v1/legal-sources/...
import { Router } from "../../../../../server/http/router.js";

import {
    getLegalSourcePack,
    listLegalSourceJurisdictions,
    searchLegalSources,
} from "../../../../../server/controllers/legalSource.controller.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

// Public: approved legal-source packs and section search.
router.get("/", getLegalSourcePack);
router.get("/jurisdictions", listLegalSourceJurisdictions);
router.get("/search", searchLegalSources);

const handler = apiRoutes([{ prefix: "/api/v1/legal-sources", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
