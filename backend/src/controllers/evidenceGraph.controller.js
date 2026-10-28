import mongoose from "mongoose";

import PropertyClaim from "../models/PropertyClaim.js";
import EvidenceLink from "../models/EvidenceLink.js";

import {
    findManageableProperty,
    attachEvidenceToClaim,
} from "../services/evidenceGraph.service.js";
import { recordAdminAction } from "../services/adminAudit.service.js";

const getUserId = (req) => req.user?._id || req.user?.id;

export const createPropertyClaim = async (req, res) => {
    try {
        const { propertyId } = req.params;
        const { claimType, statement, claimedValue, source = "listing" } =
            req.body;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({ message: "Invalid property ID." });
        }

        const result = await findManageableProperty(propertyId, req);

        if (result.error === "NOT_FOUND") {
            return res.status(404).json({ message: "Property not found." });
        }

        if (result.error === "FORBIDDEN") {
            return res.status(403).json({ message: "Access denied." });
        }

        const allowedTypes = [
            "rent",
            "bedrooms",
            "bathrooms",
            "amenity",
            "ownership",
            "availability",
            "other",
        ];

        const allowedSources = ["listing", "landlord", "document", "other"];

        if (
            !allowedTypes.includes(claimType) ||
            typeof statement !== "string" ||
            !statement.trim() ||
            statement.length > 1000 ||
            !allowedSources.includes(source)
        ) {
            return res.status(400).json({
                message: "Invalid claim type, statement, or source.",
            });
        }

        const claim = await PropertyClaim.create({
            property: result.property._id,
            claimType,
            statement: statement.trim(),
            claimedValue: claimedValue ?? null,
            source,
            createdBy: getUserId(req),
        });

        return res.status(201).json({
            message: "Property claim created.",
            claim,
        });
    } catch (error) {
        console.error("Create property claim error:", error);
        return res.status(500).json({
            message: "Could not create property claim.",
        });
    }
};

export const attachClaimEvidence = async (req, res) => {
    try {
        const { propertyId, claimId } = req.params;
        const { fileId } = req.body;

        if (
            !mongoose.isValidObjectId(propertyId) ||
            !mongoose.isValidObjectId(claimId) ||
            !mongoose.isValidObjectId(fileId)
        ) {
            return res.status(400).json({
                message: "Invalid property, claim, or file ID.",
            });
        }

        const propertyResult = await findManageableProperty(propertyId, req);

        if (propertyResult.error === "NOT_FOUND") {
            return res.status(404).json({ message: "Property not found." });
        }

        if (propertyResult.error === "FORBIDDEN") {
            return res.status(403).json({ message: "Access denied." });
        }

        const result = await attachEvidenceToClaim({
            propertyId: propertyResult.property._id,
            claimId,
            fileId,
            userId: getUserId(req),
            isAdmin: req.user.role === "admin",
        });

        if (result.error === "CLAIM_NOT_FOUND") {
            return res.status(404).json({ message: "Claim not found." });
        }

        if (result.error === "FILE_NOT_FOUND") {
            return res.status(404).json({
                message: "Confirmed private evidence file not found.",
            });
        }

        if (result.error === "FILE_FORBIDDEN") {
            return res.status(403).json({
                message: "You cannot link another user's private evidence.",
            });
        }

        return res.status(201).json({
            message: "Evidence linked to claim.",
            evidenceLink: result.link,
        });
    } catch (error) {
        console.error("Attach claim evidence error:", error);
        return res.status(500).json({
            message: "Could not attach evidence.",
        });
    }
};

export const getPropertyEvidenceGraph = async (req, res) => {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({ message: "Invalid property ID." });
        }

        const propertyResult = await findManageableProperty(propertyId, req);

        if (propertyResult.error === "NOT_FOUND") {
            return res.status(404).json({ message: "Property not found." });
        }

        if (propertyResult.error === "FORBIDDEN") {
            return res.status(403).json({ message: "Access denied." });
        }

        const [claims, evidenceLinks] = await Promise.all([
            PropertyClaim.find({ property: propertyId })
                .sort({ createdAt: -1 })
                .lean(),

            EvidenceLink.find({ property: propertyId })
                .populate({
                    path: "uploadedFile",
                    select: "originalName mimeType sizeBytes purpose status uploadedBy",
                })
                .sort({ createdAt: -1 })
                .lean(),
        ]);

        // Private storage keys and signed download URLs are intentionally
        // excluded from this graph response.
        return res.json({
            propertyId,
            claims,
            evidenceLinks: evidenceLinks.map((link) => ({
                id: link._id,
                claimId: link.claim,
                relationship: link.relationship,
                explanation: link.explanation,
                linkedBy: link.linkedBy,
                createdAt: link.createdAt,
                file: link.uploadedFile
                    ? {
                        id: link.uploadedFile._id,
                        name: link.uploadedFile.originalName,
                        mimeType: link.uploadedFile.mimeType,
                        sizeBytes: link.uploadedFile.sizeBytes,
                        status: link.uploadedFile.status,
                    }
                    : null,
            })),
        });
    } catch (error) {
        console.error("Get evidence graph error:", error);
        return res.status(500).json({
            message: "Could not retrieve the evidence graph.",
        });
    }
};

export const reviewPropertyClaim = async (req, res) => {
    try {
        const { claimId } = req.params;
        const { status, reviewNote = "" } = req.body;

        if (!mongoose.isValidObjectId(claimId)) {
            return res.status(400).json({ message: "Invalid claim ID." });
        }

        if (
            !["supported", "contradicted", "inconclusive", "unreviewed"].includes(
                status
            ) ||
            typeof reviewNote !== "string" ||
            reviewNote.length > 1000
        ) {
            return res.status(400).json({
                message: "Invalid review status or review note.",
            });
        }

        const claim = await PropertyClaim.findByIdAndUpdate(
            claimId,
            {
                $set: {
                    status,
                    reviewNote: reviewNote.trim(),
                    reviewedBy: getUserId(req),
                    reviewedAt: new Date(),
                },
            },
            { new: true, runValidators: true }
        );

        if (!claim) {
            return res.status(404).json({ message: "Claim not found." });
        }

        await recordAdminAction({
            req,
            action: "property_claim_reviewed",
            targetType: "property_claim",
            targetId: claim._id,
            details: {
                newStatus: claim.status,
                reviewedAt: claim.reviewedAt,
            },
        });

        return res.json({
            message: "Claim review updated.",
            claim,
        });
    } catch (error) {
        console.error("Review property claim error:", error);
        return res.status(500).json({
            message: "Could not update claim review.",
        });
    }
};