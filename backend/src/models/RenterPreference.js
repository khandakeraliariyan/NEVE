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

        furnishing: {
            type: String,
            enum: ["furnished", "unfurnished"],
            default: null,
        },

        amenities: {
            type: [String],
            default: [],
        },

        alertsEnabled: {
            type: Boolean,
            default: true,
        },

        commute: {
            type: new mongoose.Schema(
                {
                    label: { type: String, trim: true, maxlength: 100, default: "" },
                    latitude: { type: Number, min: -90, max: 90, required: true },
                    longitude: { type: Number, min: -180, max: 180, required: true },
                    maxDistanceKm: { type: Number, min: 0.1, max: 100, required: true },
                    mode: { type: String, enum: ["walking", "driving"], default: "driving" },
                },
                { _id: false }
            ),
            default: null,
        },

        walkingDistance: {
            type: new mongoose.Schema(
                {
                    categories: { type: [String], default: [] },
                    maxDistanceMeters: { type: Number, min: 100, max: 3000, default: 1000 },
                },
                { _id: false }
            ),
            default: null,
        },

        household: {
            type: new mongoose.Schema(
                {
                    adults: { type: Number, min: 1, max: 20, default: 1 },
                    children: { type: Number, min: 0, max: 20, default: 0 },
                    pets: { type: Boolean, default: false },
                    needsStepFreeAccess: { type: Boolean, default: false },
                },
                { _id: false }
            ),
            default: null,
        },
    },
    { timestamps: true }
);

export default mongoose.model(
    "RenterPreference",
    renterPreferenceSchema
);