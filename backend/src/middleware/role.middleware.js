import User from "../models/User.js";
import { getSettings } from "../services/platformSettings.service.js";
import { ADMIN_SIGN_IN_PROVIDER } from "../services/adminAuth.service.js";
import { trackSignIn } from "../services/securityAlerts.service.js";
import { SESSION_REVOKED, isSessionRevoked, touchSession } from "../services/sessions.service.js";

// Admins may only use a session from the admin portal's email and password
// sign-in (a Neve-signed JWT), never Firebase, even when the email matches.
export function isAdminSessionAllowed(role, signInProvider) {
    return role !== "admin" || signInProvider === ADMIN_SIGN_IN_PROVIDER;
}

// Refuses a request when an admin has switched a capability off.
// check(settings, user) returns true when the request may continue.
export function requirePermission(check, message) {
    return async (req, res, next) => {
        try {
            const settings = await getSettings();
            if (check(settings, req.neveUser)) return next();
            return res.status(403).json({ success: false, message, code: "PERMISSION_DISABLED" });
        } catch (error) {
            next(error);
        }
    };
}

export function allowRoles(...allowedRoles) {
    return roleGuard(allowedRoles);
}

// Like allowRoles, but also lets suspended (inactive) accounts through, for
// the few routes a suspended person still needs, such as appealing.
// Deleted accounts are still refused.
export function allowSuspendedRoles(...allowedRoles) {
    return roleGuard(allowedRoles, { allowInactive: true });
}

function roleGuard(allowedRoles, { allowInactive = false } = {}) {
    return async function (req, res, next) {
        try {
            if (!req.user?.uid) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            // Load the current role from Neve's database.
            const user = await User.findOne({
                firebaseUid: req.user.uid,
            });

            if (!user) {
                return res.status(403).json({
                    success: false,
                    message: "Create your Neve profile first",
                });
            }

            if (!user.isActive && (!allowInactive || user.deletedAt)) {
                return res.status(403).json({
                    success: false,
                    message: "Your account is inactive",
                });
            }

            if (!isAdminSessionAllowed(user.role, req.user.signInProvider)) {
                return res.status(403).json({
                    success: false,
                    code: "ADMIN_PASSWORD_SIGN_IN_REQUIRED",
                    message: "Admins must sign in through the admin portal with email and password.",
                });
            }

            if (isSessionRevoked(user, req.user)) {
                return res.status(401).json(SESSION_REVOKED);
            }

            if (!allowedRoles.includes(user.role)) {
                return res.status(403).json({
                    success: false,
                    message: "You do not have permission to access this resource",
                });
            }

            req.neveUser = user;

            // New-device and password-change alerts. Runs after the response
            // path so it never slows or fails the request.
            if (req.user.authTime) {
                const signIn = {
                    authTime: req.user.authTime,
                    userAgent: req.get?.("user-agent") ?? "",
                    signInProvider: req.user.signInProvider,
                    picture: req.user.picture ?? null,
                };
                const request = { userAgent: signIn.userAgent, ip: req.ip };
                setImmediate(() => {
                    trackSignIn(user, signIn).catch((error) =>
                        console.error("Sign-in tracking error:", error)
                    );
                    touchSession(user, req.user, request).catch((error) =>
                        console.error("Session tracking error:", error)
                    );
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}