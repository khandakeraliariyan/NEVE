import mongoose from "mongoose";

const renterPreferenceSchema = new mongoose.Schema(
    {
        renter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true,
        },

        cities: {
            type: [String],
            default: [],
        },

        areas: {
            type: [String],
            default: [],
        },

        minRent: {
            type: Number,
            min: 0,
            default: null,
        },

        maxRent: {
            type: Number,
            min: 0,
            default: null,
        },

        bedrooms: {
            type: [Number],
            default: [],
        },

        propertyTypes: {
            type: [String],
            default: [],
        },

        amenities: {
            type: [String],
            default: [],
        },
    },
    { timestamps: true }
);

export default mongoose.model(
    "RenterPreference",
    renterPreferenceSchema
);