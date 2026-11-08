import { env } from "../config/env.js";
import User from "../models/User.js";

// Sends in-app notifications out by email and push. Delivery never blocks or
// fails the action that created the notification: results are recorded on
// the notification's `delivery` field.

const INVALID_TOKEN_CODES = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "messaging/invalid-argument",
]);

export function isEmailConfigured() {
    return Boolean(env.EMAIL_PROVIDER && env.EMAIL_API_KEY && env.EMAIL_FROM);
}

export function isPushConfigured() {
    return env.PUSH_NOTIFICATIONS_ENABLED === true;
}

export function isDeliveryConfigured() {
    return isEmailConfigured() || isPushConfigured();
}

// Which channels this user should get this notification on.
export function chooseChannels(user, type, { email = isEmailConfigured(), push = isPushConfigured() } = {}) {
    if (!user || user.isActive === false) {
        return { email: false, push: false };
    }
    const preferences = user.notificationPreferences ?? {};
    const muted = Array.isArray(preferences.mutedTypes) && preferences.mutedTypes.includes(type);
    if (muted) {
        return { email: false, push: false };
    }
    return {
        email: email && preferences.email !== false && Boolean(user.email),
        push: push && preferences.push !== false && Array.isArray(user.pushTokens) && user.pushTokens.length > 0,
    };
}

export function buildEmail(notification, user) {
    const link = `${env.CLIENT_URL.replace(/\/$/, "")}/notifications`;
    const greeting = user.displayName ? `Hi ${user.displayName},` : "Hi,";
    return {
        to: user.email,
        subject: notification.title,
        text: [
            greeting,
            "",
            notification.message,
            "",
            `Open Neve to see it: ${link}`,
            "",
            "You can turn off email notifications in your Neve notification settings.",
        ].join("\n"),
    };
}

export async function sendEmail({ to, subject, text }, fetchImpl = fetch) {
    let request;
    if (env.EMAIL_PROVIDER === "resend") {
        request = {
            url: "https://api.resend.com/emails",
            body: { from: env.EMAIL_FROM, to: [to], subject, text },
        };
    } else if (env.EMAIL_PROVIDER === "sendgrid") {
        request = {
            url: "https://api.sendgrid.com/v3/mail/send",
            body: {
                personalizations: [{ to: [{ email: to }] }],
                from: { email: env.EMAIL_FROM },
                subject,
                content: [{ type: "text/plain", value: text }],
            },
        };
    } else {
        throw new Error("Email provider is not configured.");
    }

    const response = await fetchImpl(request.url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.EMAIL_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        throw new Error(`Email provider returned HTTP ${response.status}.`);
    }
}

async function getMessaging() {
    const [{ getMessaging: firebaseMessaging }, { firebaseApp }] = await Promise.all([
        import("firebase-admin/messaging"),
        import("../config/firebase.js"),
    ]);
    return firebaseMessaging(firebaseApp);
}

export async function sendPush(notification, tokens, messaging = null) {
    const client = messaging ?? (await getMessaging());
    const response = await client.sendEachForMulticast({
        tokens,
        notification: { title: notification.title, body: notification.message.slice(0, 240) },
        data: {
            notificationId: String(notification._id),
            type: String(notification.type),
        },
    });
    const invalidTokens = response.responses
        .map((result, index) => (!result.success && INVALID_TOKEN_CODES.has(result.error?.code) ? tokens[index] : null))
        .filter(Boolean);
    return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokens,
    };
}

export async function deliverNotification(notification, deps = {}) {
    const UserModel = deps.UserModel ?? User;
    const user = await UserModel.findById(notification.recipient)
        .select("email displayName isActive notificationPreferences +pushTokens")
        .lean();
    const channels = chooseChannels(user, notification.type, deps.channels);
    const now = new Date();
    const delivery = {
        email: { status: "skipped", at: now, error: null },
        push: { status: "skipped", at: now, successCount: 0, failureCount: 0, error: null },
    };

    if (channels.email) {
        try {
            await (deps.sendEmail ?? sendEmail)(buildEmail(notification, user));
            delivery.email.status = "sent";
        } catch (error) {
            delivery.email.status = "failed";
            delivery.email.error = String(error.message ?? error).slice(0, 300);
        }
    }

    if (channels.push) {
        try {
            const tokens = user.pushTokens.map((entry) => entry.token);
            const result = await (deps.sendPush ?? sendPush)(notification, tokens);
            delivery.push.successCount = result.successCount;
            delivery.push.failureCount = result.failureCount;
            delivery.push.status = result.successCount > 0 ? "sent" : "failed";
            if (result.invalidTokens.length) {
                await UserModel.updateOne(
                    { _id: user._id },
                    { $pull: { pushTokens: { token: { $in: result.invalidTokens } } } }
                );
            }
        } catch (error) {
            delivery.push.status = "failed";
            delivery.push.error = String(error.message ?? error).slice(0, 300);
        }
    }

    return delivery;
}

// Fire-and-forget: records the outcome on the notification and logs failures.
export function queueNotificationDelivery(notification, NotificationModel) {
    if (!isDeliveryConfigured() || !notification?._id) return;
    setImmediate(async () => {
        try {
            const delivery = await deliverNotification(notification);
            await NotificationModel.updateOne({ _id: notification._id }, { $set: { delivery } });
        } catch (error) {
            console.error("Notification delivery error:", error);
        }
    });
}
