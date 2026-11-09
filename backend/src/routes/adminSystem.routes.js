import express from "express";

import {
    getNotificationDeliverySummary,
    getSystemHealth,
    listNotificationDeliveries,
    listSystemJobRuns,
    retryNotificationDelivery,
    runBackupNow,
    runNotificationDigestNow,
    runNotificationRemindersNow,
    runPhotoHashBackfillNow,
    runRetentionPurgeNow,
} from "../controllers/adminSystem.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/health", getSystemHealth);
router.get("/jobs", listSystemJobRuns);
router.post("/retention-purge", runRetentionPurgeNow);
router.post("/backups", runBackupNow);
router.post("/notification-reminders", runNotificationRemindersNow);
router.post("/photo-hash-backfill", runPhotoHashBackfillNow);
router.post("/notification-digest", runNotificationDigestNow);
router.get("/notification-deliveries/summary", getNotificationDeliverySummary);
router.get("/notification-deliveries", listNotificationDeliveries);
router.post("/notification-deliveries/:deliveryId/retry", retryNotificationDelivery);

export default router;
