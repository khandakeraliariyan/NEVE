import express from "express";

import {
    getMyNotifications,
    getUnreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
} from "../controllers/notification.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles(
    "renter",
    "landlord",
    "property_manager",
    "mediator",
    "legal_reviewer",
    "admin"
));

router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllNotificationsAsRead);
router.get("/", getMyNotifications);
router.patch("/:id/read", markNotificationAsRead);

export default router;