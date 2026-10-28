
import express from "express";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import {
    getLandlordDashboard
} from "../controllers/landlordDashboard.controller.js";
import {
    getLandlordPerformance
} from "../controllers/landlordPerformance.controller.js";

const router = express.Router();

router.get(
    "/properties",
    authenticateUser,
    allowRoles("landlord"),
    getLandlordDashboard
);

router.get(
    "/performance",
    authenticateUser,
    allowRoles("landlord"),
    getLandlordPerformance
);

export default router;
