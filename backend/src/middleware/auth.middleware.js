import { firebaseAuth } from "../config/firebase.js";
import User from "../models/User.js";
import {
    ADMIN_SIGN_IN_PROVIDER,
    isAdminToken,
    verifyAdminToken,
} from "../services/adminAuth.service.js";

const INVALID_TOKEN = {
    success: false,
    message: "Invalid or expired authentication token",
};

// Admin portal JWT: check the signature, then that the account is still an
// active admin and the password hasn't changed since the token was issued.
async function authenticateAdminToken(token) {
    const claims = verifyAdminToken(token);
    const user = await User.findById(claims.sub).select("+passwordChangedAt");
    if (!user || user.role !== "admin" || !user.isActive) return null;
    if (user.passwordChangedAt && claims.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
        return null;
    }
    return {
        // Downstream code looks the profile up by firebaseUid.
        uid: user.firebaseUid,
        email: user.email,
        emailVerified: true,
        name: user.displayName,
        signInProvider: ADMIN_SIGN_IN_PROVIDER,
    };
}

export async function authenticateUser(req, res, next) {
    try {
        const authorization = req.headers.authorization;

        if (!authorization?.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authentication token is required",
            });
        }

        const idToken = authorization.slice(7).trim();

        if (!idToken) {
            return res.status(401).json({
                success: false,
                message: "Authentication token is missing",
            });
        }

        if (isAdminToken(idToken)) {
            const adminUser = await authenticateAdminToken(idToken);
            if (!adminUser) return res.status(401).json(INVALID_TOKEN);
            req.user = adminUser;
            return next();
        }

        const decodedToken = await firebaseAuth.verifyIdToken(idToken);

        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email ?? null,
            emailVerified: decodedToken.email_verified ?? false,
            name: decodedToken.name ?? null,
            // "password" or "google.com"
            signInProvider: decodedToken.firebase?.sign_in_provider ?? null,
        };

        next();
    } catch (error) {
        console.error("Authentication failed:", error.code ?? error.name ?? error.message);

        return res.status(401).json(INVALID_TOKEN);
    }
}
