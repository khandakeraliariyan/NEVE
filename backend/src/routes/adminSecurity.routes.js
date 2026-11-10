import express from "express";

import {
    createIncident,
    getSecurityOverview,
    listAuthEvents,
    listIncidents,
    updateIncident,
} from "../controllers/adminSecurity.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser, allowRoles("admin"));

router.get("/overview", getSecurityOverview);
router.get("/auth-events", listAuthEvents);
router.get("/incidents", listIncidents);
router.post("/incidents", createIncident);
router.patch("/incidents/:incidentId", updateIncident);

export default router;
