import mongoose from "mongoose";

import Property from "../models/Property.js";
import UploadedFile from "../models/UploadedFile.js";

import { createDownloadUrl } from "../services/fileUpload.service.js";

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

  const landlordId = property.landlord?._id || property.landlord;

  if (
    getUserRole(req) !== "admin" &&
    String(landlordId) !== String(getUserId(req))
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
      purpose: "property_image",
      status: "uploaded",
    });

    if (!file) {
      return res.status(404).json({
        message: "Confirmed property image not found.",
      });
    }

    // Non-admins may attach only their own uploaded images.
    if (
      getUserRole(req) !== "admin" &&
      String(file.uploadedBy) !== String(getUserId(req))
    ) {
      return res.status(403).json({
        message: "You cannot attach another user's image.",
      });
    }

    const imageIds = result.property.images || [];

    if (
      imageIds.some((id) => String(id) === String(file._id))
    ) {
      return res.json({ message: "Image is already attached." });
    }

    result.property.images = [...imageIds, file._id];
    await result.property.save();

    return res.status(200).json({
      message: "Property image attached successfully.",
      propertyId: result.property._id,
      imageId: file._id,
      imageCount: result.property.images.length,
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
    const existingImages = property.images || [];
    const imageExists = existingImages.some(
      (id) => String(id) === String(fileId)
    );

    if (!imageExists) {
      return res.status(404).json({
        message: "Image is not attached to this property.",
      });
    }

    property.images = existingImages.filter(
      (id) => String(id) !== String(fileId)
    );

    await property.save();

    // Keep the uploaded file record and R2 object.
    // A separate cleanup process can delete unused objects safely later.

    return res.json({
      message: "Image removed from property.",
      propertyId: property._id,
      imageCount: property.images.length,
    });
  } catch (error) {
    console.error("Remove property image error:", error);
    return res.status(500).json({
      message: "Could not remove property image.",
    });
  }
};

export const getPropertyImages = async (req, res) => {
  try {
    const { propertyId } = req.params;

    if (!mongoose.isValidObjectId(propertyId)) {
      return res.status(400).json({ message: "Invalid property ID." });
    }

    const property = await Property.findOne({
      _id: propertyId,
      status: "published",
    }).populate({
      path: "images",
      select: "purpose status originalName mimeType sizeBytes storageKey",
    });

    if (!property) {
      return res.status(404).json({
        message: "Published property not found.",
      });
    }

    const images = await Promise.all(
      (property.images || [])
        .filter(
          (file) =>
            file &&
            file.purpose === "property_image" &&
            file.status === "uploaded"
        )
        .map(async (file) => ({
          id: file._id,
          name: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          url: await createDownloadUrl(file.storageKey),
        }))
    );

    return res.json({
      propertyId: property._id,
      images,
    });
  } catch (error) {
    console.error("Get property images error:", error);
    return res.status(500).json({
      message: "Could not retrieve property images.",
    });
  }
};
