import User from "../models/User.js";

// Admins may only use a session from email and password sign-in, never Google
// or any other provider, even when the email matches.
export function isAdminSessionAllowed(role, signInProvider) {
    return role !== "admin" || signInProvider === "password";
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
            next();
        } catch (error) {
            next(error);
        }
    };
}