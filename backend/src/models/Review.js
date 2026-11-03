
import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
    {
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            index: true
        },

        renter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
            validate: {
                validator: Number.isInteger,
                message: "Rating must be a whole number from 1 to 5."
            }
        },

        comment: {
            type: String,
            required: true,
            trim: true,
            minlength: 10,
            maxlength: 1000
        },

        moderationStatus: {
            type: String,
            enum: ["visible", "hidden"],
            default: "visible",
            index: true
        },

        moderatedAt: {
            type: Date,
            default: null
        },

        moderatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        moderationReason: {
            type: String,
            default: null,
            maxlength: 500
        },

        // One public reply from the property's landlord.
        landlordReply: {
            type: new mongoose.Schema(
                {
                    text: {
                        type: String,
                        required: true,
                        trim: true,
                        minlength: 2,
                        maxlength: 1000
                    },
                    author: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: "User",
                        required: true
                    },
                    repliedAt: { type: Date, default: Date.now },
                    editedAt: { type: Date, default: null }
                },
                { _id: false }
            ),
            default: null
        }
    },
    { timestamps: true }
);

// One review per renter for each property.
reviewSchema.index(
    { property: 1, renter: 1 },
    { unique: true }
);

reviewSchema.index({ property: 1, createdAt: -1 });

const Review = mongoose.model("Review", reviewSchema);

export default Review;
