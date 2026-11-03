
import mongoose from "mongoose";
import Property from "../models/Property.js";
import Review from "../models/Review.js";
import ViewingRequest from "../models/ViewingRequest.js";

const PAGE_LIMIT = 20;

export const REVIEW_ELIGIBLE_VIEWING_STATUSES = ["confirmed", "completed"];

function validateReviewInput(rating, comment) {
    if (
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
    ) {
        return "Rating must be a whole number from 1 to 5.";
    }

    if (
        typeof comment !== "string" ||
        comment.trim().length < 10 ||
        comment.trim().length > 1000
    ) {
        return "Comment must be between 10 and 1000 characters.";
    }

    return null;
}

// Public: list reviews and rating summary for a published property.
export async function getPropertyReviews(req, res, next) {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID."
            });
        }

        const property = await Property.findOne({
            _id: propertyId,
            status: "published"
        }).select("_id");

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Published property not found."
            });
        }

        const page = Number(req.query.page ?? 1);

        if (!Number.isInteger(page) || page < 1) {
            return res.status(400).json({
                success: false,
                message: "Page must be a positive integer."
            });
        }

        const filter = {
            property: property._id,
            moderationStatus: "visible"
        };

        const [reviews, total, summary] = await Promise.all([
            Review.find(filter)
                .populate("renter", "displayName photoURL")
                .sort({ createdAt: -1 })
                .skip((page - 1) * PAGE_LIMIT)
                .limit(PAGE_LIMIT)
                .lean(),

            Review.countDocuments(filter),

            Review.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: null,
                        averageRating: { $avg: "$rating" },
                        reviewCount: { $sum: 1 }
                    }
                }
            ])
        ]);

        const stats = summary[0] || {
            averageRating: null,
            reviewCount: 0
        };

        return res.status(200).json({
            success: true,
            rating: {
                average: stats.averageRating === null
                    ? null
                    : Number(stats.averageRating.toFixed(2)),
                count: stats.reviewCount
            },
            pagination: {
                page,
                limit: PAGE_LIMIT,
                total,
                totalPages: Math.ceil(total / PAGE_LIMIT)
            },
            reviews
        });
    } catch (error) {
        next(error);
    }
}

// Renter: submit a review after an accepted viewing request.
export async function createReview(req, res, next) {
    try {
        const { propertyId } = req.params;
        const { rating, comment } = req.body;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID."
            });
        }

        const validationError = validateReviewInput(rating, comment);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const property = await Property.findOne({
            _id: propertyId,
            status: "published"
        }).select("_id");

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Published property not found."
            });
        }

        const eligibleViewing = await ViewingRequest.findOne({
            property: property._id,
            renter: req.neveUser._id,
            status: { $in: REVIEW_ELIGIBLE_VIEWING_STATUSES }
        }).select("_id");

        if (!eligibleViewing) {
            return res.status(403).json({
                success: false,
                message:
                    "An accepted viewing request is required to review this property."
            });
        }

        const review = await Review.create({
            property: property._id,
            renter: req.neveUser._id,
            rating,
            comment: comment.trim()
        });

        return res.status(201).json({
            success: true,
            message: "Review submitted successfully.",
            review
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "You have already reviewed this property."
            });
        }

        next(error);
    }
}

// Renter: edit only their own review.
export async function updateReview(req, res, next) {
    try {
        const { reviewId } = req.params;
        const { rating, comment } = req.body;

        if (!mongoose.isValidObjectId(reviewId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid review ID."
            });
        }

        const validationError = validateReviewInput(rating, comment);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const review = await Review.findOneAndUpdate(
            {
                _id: reviewId,
                renter: req.neveUser._id
            },
            {
                $set: {
                    rating,
                    comment: comment.trim()
                }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found or you cannot edit it."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Review updated successfully.",
            review
        });
    } catch (error) {
        next(error);
    }
}

// Renter: delete only their own review.
export async function deleteReview(req, res, next) {
    try {
        const { reviewId } = req.params;

        if (!mongoose.isValidObjectId(reviewId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid review ID."
            });
        }

        const review = await Review.findOneAndDelete({
            _id: reviewId,
            renter: req.neveUser._id
        });

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found or you cannot delete it."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Review deleted successfully."
        });
    } catch (error) {
        next(error);
    }
}

async function findReviewOnOwnedProperty(req, res) {
    const { reviewId } = req.params;

    if (!mongoose.isValidObjectId(reviewId)) {
        res.status(400).json({ success: false, message: "Invalid review ID." });
        return null;
    }

    const review = await Review.findOne({
        _id: reviewId,
        moderationStatus: "visible"
    });

    if (!review) {
        res.status(404).json({ success: false, message: "Review not found." });
        return null;
    }

    const ownsProperty = await Property.exists({
        _id: review.property,
        landlord: req.neveUser._id
    });

    if (!ownsProperty) {
        res.status(403).json({
            success: false,
            message: "Only the property's landlord can reply to this review."
        });
        return null;
    }

    return review;
}

// Landlord: add or edit the public reply to a review on their property.
export async function upsertReviewReply(req, res, next) {
    try {
        const text =
            typeof req.body?.text === "string" ? req.body.text.trim() : "";

        if (text.length < 2 || text.length > 1000) {
            return res.status(400).json({
                success: false,
                message: "Reply must be between 2 and 1000 characters."
            });
        }

        const review = await findReviewOnOwnedProperty(req, res);
        if (!review) return;

        const editing = Boolean(review.landlordReply);
        review.landlordReply = {
            text,
            author: req.neveUser._id,
            repliedAt: review.landlordReply?.repliedAt ?? new Date(),
            editedAt: editing ? new Date() : null
        };
        await review.save();

        return res.status(editing ? 200 : 201).json({
            success: true,
            message: editing ? "Reply updated." : "Reply posted.",
            review
        });
    } catch (error) {
        next(error);
    }
}

// Landlord: remove their reply.
export async function deleteReviewReply(req, res, next) {
    try {
        const review = await findReviewOnOwnedProperty(req, res);
        if (!review) return;

        if (!review.landlordReply) {
            return res.status(404).json({
                success: false,
                message: "This review has no reply."
            });
        }

        review.landlordReply = null;
        await review.save();

        return res.status(200).json({
            success: true,
            message: "Reply deleted."
        });
    } catch (error) {
        next(error);
    }
}
