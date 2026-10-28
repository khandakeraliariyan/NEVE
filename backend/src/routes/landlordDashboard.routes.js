
import express from "express";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import {
    getLandlordDashboard
} from "../controllers/landlordDashboard.controller.js";

const router = express.Router();

router.get(
    "/properties",
    authenticateUser,
    allowRoles("landlord"),
    getLandlordDashboard
);

export default router;
