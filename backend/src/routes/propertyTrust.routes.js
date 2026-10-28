import express from "express";

import {
    getPropertyTrustSummary,
} from "../controllers/propertyTrust.controller.js";

const router = express.Router();

router.get("/:propertyId", getPropertyTrustSummary);

export default router;
