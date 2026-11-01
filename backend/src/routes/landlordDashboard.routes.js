
import express from "express";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import {
    getLandlordDashboard
} from "../controllers/landlordDashboard.controller.js";
import {
    getLandlordPerformance
} from "../controllers/landlordPerformance.controller.js";
import { getAssignedTenancyDashboard } from "../controllers/landlordDashboard.controller.js";

const router = express.Router();

router.get(
    "/properties",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    getLandlordDashboard
);

router.get(
    "/performance",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    getLandlordPerformance
);

router.get(
    "/tenancies",
    authenticateUser,
    allowRoles("property_manager"),
    getAssignedTenancyDashboard
);

export default router;
