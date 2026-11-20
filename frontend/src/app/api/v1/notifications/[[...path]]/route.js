// /api/v1/notifications/...
import { Router } from "../../../../../server/http/router.js";
import { urlencodedBody } from "../../../../../server/middleware/formBody.middleware.js";

import {
    getMyNotifications,
    getUnreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
} from "../../../../../server/controllers/notification.controller.js";
import {
    confirmUnsubscribe,
    getNotificationPreferences,
    showUnsubscribe,
    updateNotificationPreferences,
} from "../../../../../server/controllers/notificationSettings.controller.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

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


const handler = apiRoutes([{ prefix: "/api/v1/notifications", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
