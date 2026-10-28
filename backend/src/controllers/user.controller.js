import User from "../models/User.js";

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