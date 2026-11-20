import { Router } from "../http/router.js";
import { urlencodedBody } from "../middleware/formBody.middleware.js";

import {
    getMyNotifications,
    getUnreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
} from "../controllers/notification.controller.js";
import {
    confirmUnsubscribe,
    getNotificationPreferences,
    showUnsubscribe,
    updateNotificationPreferences,
} from "../controllers/notificationSettings.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = Router();

// Email unsubscribe links work without signing in; the signed token says who.
router.get("/unsubscribe", showUnsubscribe);
router.post(
    "/unsubscribe",
    urlencodedBody({ limitBytes: 2 * 1024 }),
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
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllNotificationsAsRead);
router.get("/", getMyNotifications);
router.patch("/:id/read", markNotificationAsRead);

export default router;