import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

import { env } from "../config/env.js";
import User from "../models/User.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { MIN_ADMIN_PASSWORD_LENGTH, hashPassword } from "../services/adminAuth.service.js";
import { createNotification } from "../services/notification.service.js";
import { isEmailConfigured, sendEmail } from "../services/notificationDelivery.service.js";
import { escapeHtml } from "../services/notificationTemplates.js";

// Admins create legal reviewer and admin accounts directly.
// - Legal reviewers sign in with Firebase like everyone else: Neve creates
//   their Firebase account and a "set your password" link.
// - Admins sign in only at the admin portal: Neve creates the account with no
//   password and a one-time setup link (48 hours) to choose one.
// Links are emailed when email is configured; otherwise they're returned
// once, for the creating admin to pass on privately.

const SETUP_HOURS = 48;
const STAFF_ROLES = ["legal_reviewer", "admin"];

export const StaffSchema = z
    .object({
        role: z.enum(STAFF_ROLES),
        email: z.string().trim().toLowerCase().email().max(254),
        displayName: z.string().trim().min(2).max(100),
    })
    .strict();

export const hashSetupToken = (token) => createHash("sha256").update(String(token)).digest("hex");

async function firebase() {
    const { firebaseAuth } = await import("../config/firebase.js");
    return firebaseAuth;
}

async function emailLink({ to, subject, intro, link, linkLabel, note }) {
    const text = `Hi,\n\n${intro}\n\n${linkLabel}: ${link}\n\n${note}`;
    const html = `<p>Hi,</p><p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(linkLabel)}</a></p><p>${escapeHtml(note)}</p>`;
    await sendEmail({ to, subject, text, html });
}

// POST /api/v1/admin/users/staff  { role, email, displayName }
export async function createStaffAccount(req, res, next) {
    try {
        const parsed = StaffSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            return res.status(400).json({ success: false, message: `${issue.path.join(".") || "body"}: ${issue.message}` });
        }
        const { role, email, displayName } = parsed.data;

        const existing = await User.findOne({ email }).select("role isActive deletedAt");
        if (existing && !existing.deletedAt) {
            return res.status(409).json({
                success: false,
                message:
                    role === "legal_reviewer" && existing.role === "renter"
                        ? "This email already has a renter account. Make it a legal reviewer from the Legal reviewers page instead."
                        : `This email already has a Neve ${existing.role.replace("_", " ")} account.`,
            });
        }

        let user;
        let link;
        let instructions;
        if (role === "legal_reviewer") {
            const auth = await firebase();
            let record = await auth.getUserByEmail(email).catch((error) => {
                if (error?.code === "auth/user-not-found") return null;
                throw error;
            });
            record ??= await auth.createUser({ email, displayName, emailVerified: false, disabled: false });
            user = await User.create({ firebaseUid: record.uid, email, displayName, role: "legal_reviewer" });
            link = await auth.generatePasswordResetLink(email, { url: `${env.CLIENT_URL.replace(/\/$/, "")}/sign-in` });
            instructions = "They set a password with this link, then sign in at the normal sign-in page.";
        } else {
            const token = randomBytes(32).toString("base64url");
            user = await User.create({
                firebaseUid: `neve-admin:${randomUUID()}`,
                email,
                displayName,
                role: "admin",
                passwordHash: null,
                adminSetup: {
                    tokenHash: hashSetupToken(token),
                    expiresAt: new Date(Date.now() + SETUP_HOURS * 60 * 60 * 1000),
                    createdBy: req.neveUser._id,
                },
                verification: { email: { verified: true, verifiedAt: new Date() } },
            });
            link = `${env.CLIENT_URL.replace(/\/$/, "")}/admin/setup?token=${token}`;
            instructions = `They choose a password (at least ${MIN_ADMIN_PASSWORD_LENGTH} characters) with this link within ${SETUP_HOURS} hours, then sign in at the admin portal.`;
        }

        let emailed = false;
        if (isEmailConfigured()) {
            try {
                await emailLink({
                    to: email,
                    subject: role === "admin" ? "You've been made a Neve admin" : "You've been invited to review on Neve",
                    intro:
                        role === "admin"
                            ? `${req.neveUser.displayName} created a Neve admin account for you. Choose your password to start.`
                            : `${req.neveUser.displayName} created a Neve legal reviewer account for you. Set your password to start reviewing legal sources and shared cases.`,
                    link,
                    linkLabel: role === "admin" ? "Choose your admin password" : "Set your password",
                    note: role === "admin" ? `The link works once and expires in ${SETUP_HOURS} hours.` : "The link expires after a while; ask the admin for a new one if it does.",
                });
                emailed = true;
            } catch (error) {
                console.error("Staff account email error:", error.message ?? error);
            }
        }

        await recordAdminAction({
            req,
            action: `staff_${role}_created`,
            targetType: "user",
            targetId: user._id,
            details: { role, emailed },
        });
        if (role === "legal_reviewer") {
            await createNotification({
                recipient: user._id,
                type: "staff_role_changed",
                title: "Welcome to Neve as a legal reviewer",
                message: "Add your Bar Council enrolment number in Settings and submit your credentials on the Verification page.",
                link: "/verification",
            }).catch(() => {});
        }

        res.set("Cache-Control", "private, no-store");
        return res.status(201).json({
            success: true,
            message: emailed
                ? `Account created. We emailed ${email} a link to get started.`
                : "Account created. Email isn't set up, so send them the link below privately. It's shown only now.",
            data: {
                user: { _id: user._id, displayName: user.displayName, email: user.email, role: user.role },
                // Only shown when it couldn't be emailed.
                setupLink: emailed ? null : link,
                instructions,
            },
        });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ success: false, message: "An account with this email already exists." });
        }
        if (typeof error?.code === "string" && error.code.startsWith("auth/")) {
            return res.status(502).json({ success: false, message: `Firebase couldn't create the account (${error.code}).` });
        }
        next(error);
    }
}

// POST /api/v1/admin/users/:userId/setup-link
// A new setup link for an admin who hasn't chosen a password yet.
export async function renewAdminSetupLink(req, res, next) {
    try {
        const user = await User.findOne({ _id: req.params.userId, role: "admin" }).select("+passwordHash email displayName");
        if (!user) return res.status(404).json({ success: false, message: "Admin not found." });
        if (user.passwordHash) return res.status(409).json({ success: false, message: "This admin has already set a password." });
        const token = randomBytes(32).toString("base64url");
        user.adminSetup = {
            tokenHash: hashSetupToken(token),
            expiresAt: new Date(Date.now() + SETUP_HOURS * 60 * 60 * 1000),
            createdBy: req.neveUser._id,
        };
        await user.save();
        await recordAdminAction({ req, action: "staff_admin_setup_link_renewed", targetType: "user", targetId: user._id });
        res.set("Cache-Control", "private, no-store");
        return res.json({
            success: true,
            data: { setupLink: `${env.CLIENT_URL.replace(/\/$/, "")}/admin/setup?token=${token}` },
        });
    } catch (error) {
        next(error);
    }
}

const SetupSchema = z.object({
    token: z.string().min(20).max(200),
    password: z.string().min(MIN_ADMIN_PASSWORD_LENGTH).max(1024),
});

// POST /api/v1/auth/admin/setup  { token, password }  (no sign-in)
export async function completeAdminSetup(req, res, next) {
    try {
        const parsed = SetupSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(400).json({ success: false, message: `Choose a password of at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.` });
        }
        const now = new Date();
        const tokenHash = hashSetupToken(parsed.data.token);
        const passwordHash = await hashPassword(parsed.data.password);
        // One use only: the token is cleared in the same update.
        const user = await User.findOneAndUpdate(
            { role: "admin", isActive: true, "adminSetup.tokenHash": tokenHash, "adminSetup.expiresAt": { $gt: now } },
            { $set: { passwordHash, passwordChangedAt: now }, $unset: { adminSetup: "" } },
            { returnDocument: "after" }
        ).select("email displayName");
        if (!user) {
            return res.status(400).json({ success: false, message: "This setup link is invalid or has expired. Ask another admin for a new one." });
        }
        return res.json({ success: true, message: "Password set. Sign in at the admin portal.", data: { email: user.email } });
    } catch (error) {
        next(error);
    }
}
