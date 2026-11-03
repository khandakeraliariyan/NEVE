import User from "../models/User.js";
import Property from "../models/Property.js";
import { buildUserLookupFilter } from "../services/userLookup.service.js";

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
        // Staff roles (admin, mediator, ...) are never self-assigned.
        const requestedRole = req.body.role ?? "renter";

        if (!SELF_SELECTABLE_ROLES.includes(requestedRole)) {
            return res.status(400).json({
                success: false,
                message: "Role must be either renter or landlord",
            });
        }

        const user = await User.create({
            firebaseUid,
            email: req.user.email,
            displayName,
            role: requestedRole,
        });

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

        const body = req.body ?? {};
        const allowed = ["displayName", "phoneNumber", "role"];
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
