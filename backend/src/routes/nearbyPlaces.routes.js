import express from "express";
import { getPropertyNearbyPlaces } from "../controllers/nearbyPlaces.controller.js";

const router = express.Router();

router.get("/:propertyId", getPropertyNearbyPlaces);

export default router;
