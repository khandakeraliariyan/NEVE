import mongoose from "mongoose";

import UploadedFile from "../models/UploadedFile.js";
import User from "../models/User.js";
import { env } from "../config/env.js";
import { createDownloadUrl } from "../services/fileUpload.service.js";
import { isAdminSessionAllowed } from "../middleware/role.middleware.js";

export function buildProfilePhotoUrl(userId) {
    return `${env.NEVE_API_BASE_URL.replace(/\/$/, "")}/users/${userId}/photo`;
}

async function loadSignedInUser(req, res) {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) {
        res.status(404).json({ success: false, message: "Profile not found. Create your profile first." });
        return null;
    }
    if (!user.isActive) {
        res.status(403).json({ success: false, message: "Your account is inactive" });
        return null;
    }
    if (!isAdminSessionAllowed(user.role, req.user.signInProvider)) {
        res.status(403).json({
            success: false,
            code: "ADMIN_PASSWORD_SIGN_IN_REQUIRED",
            message: "Admins must sign in through the admin portal with email and password.",
        });
        return null;
    }
    return user;
}

// PUT /api/v1/users/me/photo  { fileId }
// The file must be a confirmed profile_photo upload by the signed-in user.
export async function setMyProfilePhoto(req, res, next) {
    try {
        const user = await loadSignedInUser(req, res);
        if (!user) return;

        const fileId = req.body?.fileId;
        if (!mongoose.isValidObjectId(fileId)) {
            return res.status(400).json({ success: false, message: "fileId must be a valid file ID." });
        }

        const file = await UploadedFile.findOne({
            _id: fileId,
            uploadedBy: user._id,
            purpose: "profile_photo",
            status: "uploaded",
        }).select("_id");
        if (!file) {
            return res.status(404).json({
                success: false,
                message: "Upload a profile photo first, then confirm the upload.",
            });
        }

        user.profilePhoto = file._id;
        user.photoURL = buildProfilePhotoUrl(user._id);
        await user.save();

        return res.status(200).json({ success: true, message: "Profile photo updated", user });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/users/me/photo
export async function removeMyProfilePhoto(req, res, next) {
    try {
        const user = await loadSignedInUser(req, res);
        if (!user) return;

        user.profilePhoto = null;
        user.photoURL = null;
        await user.save();

        return res.status(200).json({ success: true, message: "Profile photo removed", user });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/users/:userId/photo
// Public: redirects to a short-lived signed URL for an active user's photo.
export async function getProfilePhoto(req, res, next) {
    try {
        const { userId } = req.params;
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ success: false, message: "Invalid user ID." });
        }

        const user = await User.findOne({ _id: userId, isActive: true })
            .select("profilePhoto")
            .populate({ path: "profilePhoto", select: "purpose status storageKey" });
        const file = user?.profilePhoto;
        if (!file || file.purpose !== "profile_photo" || file.status !== "uploaded") {
            return res.status(404).json({ success: false, message: "Profile photo not found." });
        }

        const url = await createDownloadUrl(file.storageKey);
        res.set("Cache-Control", "private, max-age=240");
        return res.redirect(302, url);
    } catch (error) {
        if (error.status === 503) {
            return res.status(503).json({ success: false, message: "File storage is not configured." });
        }
        next(error);
    }
}
