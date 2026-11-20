import { Router } from "../http/router.js";

import {
    getLegalSourcePack,
    listLegalSourceJurisdictions,
    searchLegalSources,
} from "../controllers/legalSource.controller.js";

const router = Router();

// Public: approved legal-source packs and section search.
router.get("/", getLegalSourcePack);
router.get("/jurisdictions", listLegalSourceJurisdictions);
router.get("/search", searchLegalSources);

export default router;
