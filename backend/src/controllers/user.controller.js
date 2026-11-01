import User from "../models/User.js";
import { buildUserLookupFilter } from "../services/userLookup.service.js";

// GET /api/v1/users/lookup?type=manager|reviewer&q=
// Finds active staff to assign or share with. Never returns contact details.
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

        // Never accept firebaseUid or role from the request body.
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

        const user = await User.create({
            firebaseUid,
            email: req.user.email,
            displayName,
            role: "renter",
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