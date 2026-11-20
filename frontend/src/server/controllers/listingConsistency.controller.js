import mongoose from "mongoose";
import { notifyListingFlagged } from "../services/notificationEvents.service.js";

import Property from "../models/Property.js";
import ListingWarning from "../models/ListingWarning.js";
import UploadedFile from "../models/UploadedFile.js";
import { recordAdminAction } from "../services/adminAudit.service.js";

import {
    detectListingInconsistencies,
} from "../services/listingConsistency.service.js";
import { canManageProperty } from "../services/propertyAccess.service.js";

const getUserId = (req) =>
    req.neveUser?._id ?? req.user?._id ?? req.user?.id;

export const reviewListingConsistency = async (req, res, next) => {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                message: "Invalid property ID.",
            });
        }

        const property = await Property.findById(propertyId).lean();

        if (!property) {
            return res.status(404).json({
                message: "Property not found.",
            });
        }

        if (
            req.neveUser?.role !== "admin" &&
            !(await canManageProperty(property, getUserId(req)))
        ) {
            return res.status(403).json({
                message: "You cannot review this property's consistency.",
            });
        }

        const rent = property.pricing?.monthlyRent;
        const comparableFilter = {
            _id: { $ne: property._id },
            status: "published",
            "address.city": property.address?.city,
            propertyType: property.propertyType,
            bedrooms: property.bedrooms,
        };
        const [comparables, listingsWithSameImages, imageFiles] =
            await Promise.all([
                rent > 0
                    ? Property.find(comparableFilter)
                          .select("pricing.monthlyRent")
                          .limit(100)
                          .lean()
                    : Promise.resolve([]),
                property.images?.length
                    ? Property.find({
                          _id: { $ne: property._id },
                          status: "published",
                          images: { $in: property.images },
                      })
                          .select("images")
                          .limit(100)
                          .lean()
                    : Promise.resolve([]),
                property.images?.length
                    ? UploadedFile.find({
                          _id: { $in: property.images },
                          purpose: "property_image",
                          status: "uploaded",
                      })
                          .select("imageFingerprint")
                          .lean()
                    : Promise.resolve([]),
            ]);
        const currentImageIds = new Set(
            (property.images || []).map(String)
        );
        const sharedImageIds = new Set(
            listingsWithSameImages.flatMap((listing) =>
                (listing.images || [])
                    .filter((imageId) => currentImageIds.has(String(imageId)))
                    .map(String)
            )
        );
        const fingerprints = [
            ...new Set(
                imageFiles
                    .map((file) => file.imageFingerprint)
                    .filter(Boolean)
            ),
        ];
        const reusedFingerprintFiles = fingerprints.length
            ? await UploadedFile.find({
                  _id: { $nin: property.images },
                  purpose: "property_image",
                  status: "uploaded",
                  imageFingerprint: { $in: fingerprints },
                  property: { $ne: property._id },
              })
                  .select("imageFingerprint")
                  .lean()
            : [];
        const reusedFingerprints = new Set(
            reusedFingerprintFiles.map((file) => file.imageFingerprint)
        );
        const reusedImageCount = new Set([
            ...[...sharedImageIds].map((imageId) => `image:${imageId}`),
            ...[...reusedFingerprints].map(
                (fingerprint) => `fingerprint:${fingerprint}`
            ),
        ]).size;
        const detected = detectListingInconsistencies(property, {
            comparableRents: comparables.map(
                (candidate) => candidate.pricing?.monthlyRent
            ),
            reusedImageCount,
        });

        // Refresh existing open warnings instead of creating duplicates
        // each time the consistency endpoint is called.
        const operations = detected.map((warning) => ({
            updateOne: {
                filter: {
                    property: property._id,
                    type: warning.type,
                    status: "open",
                },
                update: {
                    $set: {
                        severity: warning.severity,
                        message: warning.message,
                        evidence: warning.evidence,
                    },
                    $setOnInsert: {
                        property: property._id,
                        type: warning.type,
                        status: "open",
                    },
                },
                upsert: true,
            },
        }));

        if (operations.length > 0) {
            const result = await ListingWarning.bulkWrite(operations);
            const newWarnings = Object.keys(result.upsertedIds ?? {}).map(
                (index) => detected[Number(index)]
            );
            await notifyListingFlagged({
                property,
                warnings: newWarnings,
                actorId: getUserId(req),
            });
        }

        const warnings = await ListingWarning.find({
            property: property._id,
            status: "open",
        })
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            message: "Listing consistency review completed.",
            propertyId: property._id,
            warningCount: warnings.length,
            warnings,
            notice:
                "Warnings indicate possible inconsistencies and do not establish fraud or intentional misrepresentation.",
        });
    } catch (error) {
        return next(error);
    }
};

export const updateListingWarningStatus = async (req, res, next) => {
    try {
        const { warningId } = req.params;
        const { status } = req.body;

        if (!mongoose.isValidObjectId(warningId)) {
            return res.status(400).json({
                message: "Invalid warning ID.",
            });
        }

        if (!["reviewed", "dismissed", "resolved"].includes(status)) {
            return res.status(400).json({
                message: "Status must be reviewed, dismissed, or resolved.",
            });
        }

        const warning = await ListingWarning.findByIdAndUpdate(
            warningId,
            {
                $set: {
                    status,
                    reviewedBy: getUserId(req),
                    reviewedAt: new Date(),
                    ...(status === "dismissed"
                        ? {
                              publiclyVisible: false,
                              publicSummary: null,
                          }
                        : {}),
                },
            },
            {
                returnDocument: "after",
                runValidators: true,
            }
        );

        if (!warning) {
            return res.status(404).json({
                message: "Listing warning not found.",
            });
        }

        if (req.neveUser?.role === "admin") {
            await recordAdminAction({
                req,
                action: "listing_warning_status_updated",
                targetType: "listing_warning",
                targetId: warning._id,
                details: { newStatus: warning.status },
            });
        }

        return res.json({
            message: "Warning status updated.",
            warning,
        });
    } catch (error) {
        return next(error);
    }
};