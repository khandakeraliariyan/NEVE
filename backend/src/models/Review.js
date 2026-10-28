
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
