import express from "express";

import {
    getPropertyDetails,
    getPublicPropertyTransparency,
} from "../controllers/propertyDetail.controller.js";

const router = express.Router();

router.get("/:propertyId/details", getPropertyDetails);
router.get("/:propertyId/transparency", getPublicPropertyTransparency);

export default router;
