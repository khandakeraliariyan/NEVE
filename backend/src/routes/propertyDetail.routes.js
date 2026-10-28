import express from "express";

import { getPropertyDetails } from "../controllers/propertyDetail.controller.js";

const router = express.Router();

router.get("/:propertyId/details", getPropertyDetails);

export default router;
