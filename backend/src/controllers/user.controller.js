import mongoose from "mongoose";

import User from "../models/User.js";
import Property from "../models/Property.js";
import VerificationRequest from "../models/VerificationRequest.js";
import TenancyInvitation from "../models/TenancyInvitation.js";
import { createNotification } from "../services/notification.service.js";
import { buildUserLookupFilter } from "../services/userLookup.service.js";
import { isAdminSessionAllowed } from "../middleware/role.middleware.js";
import {
    buildPublicProfile,
    landlordPublicStats,
    validateProfileFields,
} from "../services/profile.service.js";
import { SESSION_REVOKED, isSessionRevoked } from "../services/sessions.service.js";
import { getSettings } from "../services/platformSettings.service.js";

const LANDLORD_SIGNUPS_CLOSED = {
    success: false,
    code: "LANDLORD_SIGNUPS_CLOSED",
    message: "New property owner accounts are paused right now. You can sign up as a renter.",
};

const ADMIN_SIGN_IN_REQUIRED = {
    success: false,
    code: "ADMIN_PASSWORD_SIGN_IN_REQUIRED",
    message: "Admins must sign in through the admin portal with email and password.",
};

const SELF_SELECTABLE_ROLES = ["renter", "landlord"];

// GET /api/v1/users/lookup?type=reviewer&q=
// Finds active reviewers to share with. Never returns contact details.
export async function lookupUsers(req, res, next) {
    try {
        const limit = Number(req.query.limit ?? 10);
        if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
            return res.status(400).json({
                success: false,
                message: "Limit must be between 1 and 20.",
            });
        }

        const { filter, error } = buildUserLookupFilter({
            type: req.query.type,
            q: req.query.q,
            requesterId: req.neveUser._id,
        });
        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        const users = await User.find(filter)
            .select("displayName photoURL role")
            .sort({ displayName: 1 })
            .limit(limit)
            .lean();

        res.set("Cache-Control", "private, no-store");
        return res.status(200).json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
}

// A new account may already have tenancy invitations waiting for its email.
async function notifyPendingInvitations(user) {
    if (!user.email) return;
    try {
        const invitations = await TenancyInvitation.find({
            inviteeEmail: user.email.toLowerCase(),
            status: "pending",
            expiresAt: { $gt: new Date() },
        })
            .populate("landlord", "displayName")
            .populate("property", "title")
            .limit(10)
            .lean();
        await Promise.allSettled(
            invitations.map((invitation) =>
                createNotification({
                    recipient: user._id,
                    type: "tenancy_invitation_received",
                    title: `${invitation.landlord?.displayName ?? "A landlord"} invited you to a tenancy record`,
                    message: `You've been invited to keep the tenancy records for ${invitation.property?.title ?? "a property"} on Neve. Open the invitation to accept or decline.`,
                    link: `/invitations/${invitation._id}`,
                    relatedProperty: invitation.property?._id ?? null,
                })
            )
        );
    } catch (error) {
        console.error("Pending invitation notice error:", error);
    }
}

export async function createProfile(req, res, next) {
    try {
        const firebaseUid = req.user.uid;

        // Never accept firebaseUid from the request body; role is limited below.
        const existingUser = await User.findOne({ firebaseUid });

        if (existingUser) {
            return res.status(200).json({
                success: true,
                message: "Profile already exists",
                user: existingUser,
            });
        }

        const displayName =
            typeof req.body.displayName === "string"
                ? req.body.displayName.trim()
                : "";

        if (!displayName || displayName.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Display name is required and must be at most 100 characters",
            });
        }

        // Users may only pick renter or landlord (property owner) for themselves.
        // Staff roles (admin, legal_reviewer) are never self-assigned.
        const requestedRole = req.body.role ?? "renter";

        if (!SELF_SELECTABLE_ROLES.includes(requestedRole)) {
            return res.status(400).json({
                success: false,
                message: "Role must be either renter or landlord",
            });
        }
        if (requestedRole === "landlord" && !(await getSettings()).landlordSignupsOpen) {
            return res.status(403).json(LANDLORD_SIGNUPS_CLOSED);
        }

        // Google sign-in brings the account's name, verified email and photo.
        const googlePhoto =
            req.user.signInProvider === "google.com" && typeof req.user.picture === "string"
                ? req.user.picture
                : null;
        const user = await User.create({
            firebaseUid,
            email: req.user.email,
            displayName,
            role: requestedRole,
            ...(googlePhoto
                ? { photoURL: googlePhoto, photoSource: "google", googlePhotoURL: googlePhoto }
                : {}),
            ...(req.user.emailVerified && req.user.email
                ? { verification: { email: { verified: true, verifiedAt: new Date() } } }
                : {}),
        });

        await notifyPendingInvitations(user);

        return res.status(201).json({
            success: true,
            message: "Neve profile created successfully",
            user,
        });
    } catch (error) {
        // Handle a concurrent request that created the same profile.
        if (error.code === 11000) {
            try {
                const existingUser = await User.findOne({
                    firebaseUid: req.user.uid,
                });

                if (existingUser) {
                    return res.status(200).json({
                        success: true,
                        message: "Profile already exists",
                        user: existingUser,
                    });
                }
            } catch (lookupError) {
                return next(lookupError);
            }
        }

        next(error);
    }
}

export async function getMyProfile(req, res, next) {
    try {
        const user = await User.findOne({
            firebaseUid: req.user.uid,
        }).select("-__v");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Profile not found. Create your profile first.",
            });
        }
        if (!isAdminSessionAllowed(user.role, req.user.signInProvider)) {
            return res.status(403).json(ADMIN_SIGN_IN_REQUIRED);
        }
        if (isSessionRevoked(user, req.user)) {
            return res.status(401).json(SESSION_REVOKED);
        }

        return res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        next(error);
    }
}
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{5,19}$/;

// PATCH /api/v1/users/me
// Updates the signed-in user's own profile. Renters and landlords may switch
// between those two roles; staff roles are never changed here.
export async function updateMyProfile(req, res, next) {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Profile not found. Create your profile first.",
            });
        }
        if (!isAdminSessionAllowed(user.role, req.user.signInProvider)) {
            return res.status(403).json(ADMIN_SIGN_IN_REQUIRED);
        }
        if (isSessionRevoked(user, req.user)) {
            return res.status(401).json(SESSION_REVOKED);
        }
        if (user.isActive === false) {
            return res.status(403).json({ success: false, message: "Your account is inactive" });
        }

        const body = req.body ?? {};
        const allowed = [
            "displayName",
            "phoneNumber",
            "role",
            "bio",
            "renterProfile",
            "landlordProfile",
            "reviewerProfile",
            "privacy",
            "syncPhotoWithGoogle",
        ];
        const unknown = Object.keys(body).filter((key) => !allowed.includes(key));

        if (unknown.length) {
            return res.status(400).json({
                success: false,
                message: `Unsupported fields: ${unknown.join(", ")}`,
            });
        }

        if (body.displayName !== undefined) {
            const displayName =
                typeof body.displayName === "string" ? body.displayName.trim() : "";

            if (!displayName || displayName.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Display name is required and must be at most 100 characters",
                });
            }
            user.displayName = displayName;
        }

        if (body.phoneNumber !== undefined) {
            const phone =
                typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : null;

            if (body.phoneNumber !== null && phone && !PHONE_PATTERN.test(phone)) {
                return res.status(400).json({
                    success: false,
                    message: "Enter a valid phone number (digits, spaces, dashes, optional leading +)",
                });
            }
            user.phoneNumber = phone || null;
            // A different number than the verified one isn't verified.
            const verifiedNumber = user.verification?.phone?.phoneNumber;
            if (user.verification?.phone?.verified && verifiedNumber && verifiedNumber !== user.phoneNumber) {
                user.set("verification.phone", { verified: false, phoneNumber: null, verifiedAt: null, method: null });
            }
        }

        if (body.role !== undefined && body.role !== user.role) {
            if (!SELF_SELECTABLE_ROLES.includes(user.role)) {
                return res.status(403).json({
                    success: false,
                    message: "Staff accounts can't change their own role",
                });
            }
            if (!SELF_SELECTABLE_ROLES.includes(body.role)) {
                return res.status(400).json({
                    success: false,
                    message: "Role must be either renter or landlord",
                });
            }
            if (body.role === "landlord" && !(await getSettings()).landlordSignupsOpen) {
                return res.status(403).json(LANDLORD_SIGNUPS_CLOSED);
            }
            if (user.role === "landlord") {
                const publishedListings = await Property.countDocuments({
                    landlord: user._id,
                    status: "published",
                });

                if (publishedListings > 0) {
                    return res.status(409).json({
                        success: false,
                        message: `Pause your ${publishedListings} published listing${publishedListings === 1 ? "" : "s"} before switching to a renter account.`,
                    });
                }
            }
            user.role = body.role;
        }

        const { updates: profileUpdates, error: profileError } = validateProfileFields(body, user.role);
        if (profileError) {
            return res.status(400).json({ success: false, message: profileError });
        }
        const enrolmentChanged =
            profileUpdates["profile.reviewer.barEnrolmentNumber"] !== undefined &&
            profileUpdates["profile.reviewer.barEnrolmentNumber"] !== (user.profile?.reviewer?.barEnrolmentNumber ?? "");
        for (const [path, value] of Object.entries(profileUpdates)) {
            user.set(path, value);
        }
        // A new enrolment number needs checking again.
        if (enrolmentChanged && ["pending", "verified"].includes(user.verification?.credential?.status)) {
            user.set("verification.credential", { status: "unverified", verifiedAt: null });
            await VerificationRequest.updateMany(
                { user: user._id, type: "credential", status: "pending" },
                { $set: { status: "cancelled", reviewNote: "Cancelled because the enrolment number changed." } }
            );
        }

        if (body.syncPhotoWithGoogle === true) {
            if (!user.googlePhotoURL) {
                return res.status(409).json({
                    success: false,
                    message: "Sign in with Google once so Neve has your Google photo.",
                });
            }
            user.photoSyncWithGoogle = true;
            user.photoURL = user.googlePhotoURL;
            user.photoSource = "google";
            user.profilePhoto = null;
        } else if (body.syncPhotoWithGoogle === false) {
            user.photoSyncWithGoogle = false;
        }

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Profile updated",
            user,
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/users/:userId/public
// What other users see: name, photo, role, bio, membership date and dated
// verification badges; for landlords, active listings and response rate.
// Never contact details, addresses, identity numbers or date of birth.
export async function getPublicProfile(req, res, next) {
    try {
        const { userId } = req.params;
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ success: false, message: "Invalid user ID." });
        }
        const user = await User.findOne({
            _id: userId,
            isActive: true,
            deletedAt: null,
            role: { $in: ["renter", "landlord", "legal_reviewer"] },
        })
            .select("displayName role photoURL createdAt verification privacy profile.bio profile.landlord.contactHours profile.reviewer.jurisdictions profile.reviewer.expertise")
            .lean();
        if (!user) {
            return res.status(404).json({ success: false, message: "Profile not found." });
        }
        const stats = user.role === "landlord" ? await landlordPublicStats(user._id) : null;
        res.set("Cache-Control", "public, max-age=60");
        return res.json({ success: true, data: buildPublicProfile(user, stats) });
    } catch (error) {
        next(error);
    }
}
