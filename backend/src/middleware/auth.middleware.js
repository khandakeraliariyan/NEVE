import { firebaseAuth } from "../config/firebase.js";
import User from "../models/User.js";
import {
    ADMIN_SIGN_IN_PROVIDER,
    isAdminToken,
    passesAdminCsrfCheck,
    readAdminSessionCookie,
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
        // Each admin sign-in issues a new token.
        authTime: claims.iat,
    };
}

export async function authenticateUser(req, res, next) {
    try {
        const authorization = req.headers.authorization;

        // Admin portal session: only from the httpOnly cookie, and only for
        // requests the Neve app itself made (see passesAdminCsrfCheck).
        const adminCookie = authorization ? null : readAdminSessionCookie(req);
        if (adminCookie) {
            if (!passesAdminCsrfCheck(req)) {
                return res.status(403).json({
                    success: false,
                    code: "CSRF_CHECK_FAILED",
                    message: "This request didn't come from the Neve app.",
                });
            }
            const adminUser = await authenticateAdminToken(adminCookie);
            if (!adminUser) return res.status(401).json(INVALID_TOKEN);
            req.user = adminUser;
            return next();
        }

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

        // Admin tokens are only accepted from the session cookie, so a token
        // copied out of a browser or a log can't be replayed as a header.
        if (isAdminToken(idToken)) {
            return res.status(401).json(INVALID_TOKEN);
        }

        const decodedToken = await firebaseAuth.verifyIdToken(idToken);

        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email ?? null,
            emailVerified: decodedToken.email_verified ?? false,
            name: decodedToken.name ?? null,
            // "password" or "google.com"
            signInProvider: decodedToken.firebase?.sign_in_provider ?? null,
            // When the user signed in (unchanged when the token refreshes).
            authTime: decodedToken.auth_time ?? null,
            // Google account photo, for Google sign-ins.
            picture: decodedToken.picture ?? null,
        };

        next();
    } catch (error) {
        console.error("Authentication failed:", error.code ?? error.name ?? error.message);

        return res.status(401).json(INVALID_TOKEN);
    }
}
