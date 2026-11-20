import mongoose from "mongoose";

import Property from "../models/Property.js";
import UploadedFile from "../models/UploadedFile.js";

import { createDownloadUrl } from "../services/fileUpload.service.js";
import { canManageProperty } from "../services/propertyAccess.service.js";
import { checkDuplicatePhotos } from "../services/duplicatePhoto.service.js";

const mediaFields = {
  property_image: { field: "images", label: "image", max: 20 },
  property_video: { field: "videos", label: "video", max: 5 },
  floor_plan: { field: "floorPlans", label: "floor plan", max: 5 },
};

const getUserId = (req) =>
  req.neveUser?._id || req.user?._id || req.user?.id;

const getUserRole = (req) => req.neveUser?.role || req.user?.role;

async function findManageableProperty(propertyId, req) {
  if (!mongoose.isValidObjectId(propertyId)) {
    return { error: "INVALID_ID" };
  }

  const property = await Property.findById(propertyId);

  if (!property) {
    return { error: "NOT_FOUND" };
  }

  if (
    getUserRole(req) !== "admin" &&
    !(await canManageProperty(property, getUserId(req)))
  ) {
    return { error: "FORBIDDEN" };
  }

  return { property };
}

export const attachPropertyImage = async (req, res) => {
  try {
    const { propertyId, fileId } = req.params;

    const result = await findManageableProperty(propertyId, req);

    if (result.error === "INVALID_ID") {
      return res.status(400).json({ message: "Invalid property ID." });
    }

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ message: "Property not found." });
    }

    if (result.error === "FORBIDDEN") {
      return res.status(403).json({
        message: "You cannot manage this property.",
      });
    }

    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({ message: "Invalid file ID." });
    }

    const file = await UploadedFile.findOne({
      _id: fileId,
      property: result.property._id,
      purpose: { $in: Object.keys(mediaFields) },
      status: "uploaded",
    });

    if (!file) {
      return res.status(404).json({
        message: "Confirmed property media not found.",
      });
    }

    // Non-admins may attach only their own uploaded images.
    if (
      getUserRole(req) !== "admin" &&
      String(file.uploadedBy) !== String(getUserId(req))
    ) {
      return res.status(403).json({
        message: "You cannot attach another user's media.",
      });
    }

    const media = mediaFields[file.purpose];
    const mediaIds = result.property[media.field] || [];

    if (
      mediaIds.some((id) => String(id) === String(file._id))
    ) {
      return res.json({ message: `This ${media.label} is already attached.` });
    }

    if (mediaIds.length >= media.max) {
      return res.status(409).json({
        message: `A property can have at most ${media.max} ${media.label}${
          media.max === 1 ? "" : "s"
        }.`,
      });
    }

    result.property[media.field] = [...mediaIds, file._id];
    await result.property.save();

    // Same photo on another landlord's listing: flag it for admin review.
    let duplicatePhotoWarning = null;
    if (file.purpose === "property_image") {
      try {
        duplicatePhotoWarning = await checkDuplicatePhotos(result.property);
      } catch (checkError) {
        console.error("Duplicate photo check error:", checkError);
      }
    }

    return res.status(200).json({
      message: `Property ${media.label} attached successfully.`,
      propertyId: result.property._id,
      fileId: file._id,
      purpose: file.purpose,
      mediaCount: result.property[media.field].length,
      ...(duplicatePhotoWarning
        ? {
            duplicatePhotoWarning: {
              id: duplicatePhotoWarning._id,
              message: duplicatePhotoWarning.message,
              notice:
                "This is a signal for review, not a finding of wrongdoing. If the photos are yours, you can appeal the warning.",
            },
          }
        : {}),
    });
  } catch (error) {
    console.error("Attach property image error:", error);
    return res.status(500).json({
      message: "Could not attach property image.",
    });
  }
};

export const removePropertyImage = async (req, res) => {
  try {
    const { propertyId, fileId } = req.params;

    const result = await findManageableProperty(propertyId, req);

    if (result.error === "INVALID_ID") {
      return res.status(400).json({ message: "Invalid property ID." });
    }

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ message: "Property not found." });
    }

    if (result.error === "FORBIDDEN") {
      return res.status(403).json({
        message: "You cannot manage this property.",
      });
    }

    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({ message: "Invalid file ID." });
    }

    const property = result.property;
    const media = Object.values(mediaFields).find(({ field }) =>
      (property[field] || []).some((id) => String(id) === String(fileId))
    );

    if (!media) {
      return res.status(404).json({
        message: "Media is not attached to this property.",
      });
    }

    property[media.field] = property[media.field].filter(
      (id) => String(id) !== String(fileId)
    );

    await property.save();

    // Keep the uploaded file record and R2 object.
    // A separate cleanup process can delete unused objects safely later.

    return res.json({
      message: "Media removed from property.",
      propertyId: property._id,
      mediaCount: property[media.field].length,
    });
  } catch (error) {
    console.error("Remove property image error:", error);
    return res.status(500).json({
      message: "Could not remove property image.",
    });
  }
};

export const getPropertyImages = async (req, res, next) => {
  try {
    const { propertyId } = req.params;

    if (!mongoose.isValidObjectId(propertyId)) {
      return res.status(400).json({ message: "Invalid property ID." });
    }

    const property = await Property.findOne({
      _id: propertyId,
      status: "published",
    }).populate([
      {
        path: "images",
        select: "purpose status originalName mimeType sizeBytes storageKey",
      },
      {
        path: "videos",
        select: "purpose status originalName mimeType sizeBytes storageKey",
      },
      {
        path: "floorPlans",
        select: "purpose status originalName mimeType sizeBytes storageKey",
      },
    ]);

    if (!property) {
      return res.status(404).json({
        message: "Published property not found.",
      });
    }

    const mapPublicMedia = async (files, purpose) =>
      Promise.all(
        (files || [])
          .filter(
            (file) =>
              file &&
              file.purpose === purpose &&
              file.status === "uploaded"
          )
          .map(async (file) => ({
            id: file._id,
            name: file.originalName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            url: await createDownloadUrl(file.storageKey),
            expiresInSeconds: 300,
          }))
      );

    const [images, videos, floorPlans] = await Promise.all([
      mapPublicMedia(property.images, "property_image"),
      mapPublicMedia(property.videos, "property_video"),
      mapPublicMedia(property.floorPlans, "floor_plan"),
    ]);

    return res.json({
      propertyId: property._id,
      images,
      videos,
      floorPlans,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/property-images/:propertyId/thumbnail
// Stable address for a published listing's first photo, used in emails.
// Redirects to a short-lived signed URL.
export const getPropertyThumbnail = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    if (!mongoose.isValidObjectId(propertyId)) {
      return res.status(400).json({ message: "Invalid property ID." });
    }
    const property = await Property.findOne({ _id: propertyId, status: "published" })
      .select("images")
      .populate({ path: "images", select: "purpose status storageKey" });
    const image = (property?.images ?? []).find(
      (file) => file && file.purpose === "property_image" && file.status === "uploaded"
    );
    if (!image) {
      return res.status(404).json({ message: "No photo found for this listing." });
    }
    res.set("Cache-Control", "private, no-store");
    return res.redirect(302, await createDownloadUrl(image.storageKey));
  } catch (error) {
    next(error);
  }
};
