import { z } from "zod";
import User from "../models/User.js";
import {
    signAdminToken,
    verifyAgainstDummy,
    verifyPassword,
} from "../services/adminAuth.service.js";

export function getCurrentUser(req, res) {
    return res.status(200).json({
        success: true,
        message: "Authenticated successfully",
        user: req.user,
    });
}

const adminLoginSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(1024),
});

const INVALID_CREDENTIALS = {
    success: false,
    message: "Incorrect email or password.",
};

// POST /api/v1/auth/admin/login  { email, password } -> { token, user }
export async function adminLogin(req, res, next) {
    try {
        const parsed = adminLoginSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Enter your admin email and password.",
            });
        }
        const { email, password } = parsed.data;

        const user = await User.findOne({ email, role: "admin" }).select("+passwordHash");

        // Same answer and timing for an unknown email, a non-admin, an admin
        // without a password, and a wrong password.
        const passwordOk = user?.passwordHash
            ? await verifyPassword(password, user.passwordHash)
            : await verifyAgainstDummy(password);
        if (!passwordOk) {
            return res.status(401).json(INVALID_CREDENTIALS);
        }

        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive",
            });
        }

        const token = signAdminToken(user);
        const profile = user.toObject();
        delete profile.passwordHash;

        return res.status(200).json({
            success: true,
            token,
            user: profile,
        });
    } catch (error) {
        next(error);
    }
}
