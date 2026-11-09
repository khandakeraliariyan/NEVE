import express from "express";

import {
    getMyNotifications,
    getUnreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
} from "../controllers/notification.controller.js";
import {
    confirmUnsubscribe,
    getNotificationPreferences,
    registerPushToken,
    removePushToken,
    showUnsubscribe,
    updateNotificationPreferences,
} from "../controllers/notificationSettings.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

// Email unsubscribe links work without signing in; the signed token says who.
router.get("/unsubscribe", showUnsubscribe);
router.post(
    "/unsubscribe",
    express.urlencoded({ extended: false, limit: "2kb" }),
    confirmUnsubscribe
);

router.use(authenticateUser);
router.use(allowRoles(
    "renter",
    "landlord",
    "legal_reviewer",
    "admin"
));

router.get("/preferences", getNotificationPreferences);
router.patch("/preferences", updateNotificationPreferences);
router.post("/push-tokens", registerPushToken);
router.delete("/push-tokens", removePushToken);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllNotificationsAsRead);
router.get("/", getMyNotifications);
router.patch("/:id/read", markNotificationAsRead);

export default router;