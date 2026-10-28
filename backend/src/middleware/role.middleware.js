import User from "../models/User.js";

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