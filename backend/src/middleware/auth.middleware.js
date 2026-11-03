import { firebaseAuth } from "../config/firebase.js";

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
        console.error("Authentication failed:", error.code ?? error.message);

        return res.status(401).json({
            success: false,
            message: "Invalid or expired authentication token",
        });
    }
}