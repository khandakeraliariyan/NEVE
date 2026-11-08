import User from "../models/User.js";
import { ADMIN_SIGN_IN_PROVIDER } from "../services/adminAuth.service.js";
import { recordSignIn } from "../services/securityAlerts.service.js";

// Admins may only use a session from the admin portal's email and password
// sign-in (a Neve-signed JWT), never Firebase, even when the email matches.
export function isAdminSessionAllowed(role, signInProvider) {
    return role !== "admin" || signInProvider === ADMIN_SIGN_IN_PROVIDER;
}

export function allowRoles(...allowedRoles) {
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

            if (!user.isActive) {
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

            if (!allowedRoles.includes(user.role)) {
                return res.status(403).json({
                    success: false,
                    message: "You do not have permission to access this resource",
                });
            }

            req.neveUser = user;

            // New-device and password-change alerts. Fire-and-forget: only
            // the first request after a new sign-in does any work.
            if (req.user.authTime) {
                recordSignIn({
                    userId: user._id,
                    authTime: req.user.authTime,
                    userAgent: req.get?.("user-agent"),
                    provider: req.user.signInProvider,
                    loadFirebaseRecord: async () => {
                        const { firebaseAuth } = await import("../config/firebase.js");
                        return firebaseAuth.getUser(req.user.uid);
                    },
                }).catch((error) => console.error("Sign-in tracking error:", error));
            }
            next();
        } catch (error) {
            next(error);
        }
    };
}