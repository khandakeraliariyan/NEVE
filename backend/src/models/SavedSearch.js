import mongoose from "mongoose";

const savedSearchSchema = new mongoose.Schema(
    {
        renter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        slot: {
            type: Number,
            required: true,
            min: 0,
            max: 19,
            select: false,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80,
        },
        query: { type: String, trim: true, maxlength: 120, default: "" },
        city: { type: String, trim: true, maxlength: 100, default: "" },
        area: { type: String, trim: true, maxlength: 100, default: "" },
        propertyType: {
            type: String,
            enum: ["apartment", "house", "room", "shared_accommodation"],
            default: null,
        },
        furnishing: {
            type: String,
            enum: ["furnished", "semi_furnished", "unfurnished"],
            default: null,
        },
        minRent: { type: Number, min: 0, default: null },
        maxRent: { type: Number, min: 0, default: null },
        minBedrooms: { type: Number, min: 0, max: 100, default: null },
        maxBedrooms: { type: Number, min: 0, max: 100, default: null },
        availableBy: { type: Date, default: null },
        minLeaseDurationMonths: { type: Number, min: 1, max: 120, default: null },
        maxLeaseDurationMonths: { type: Number, min: 1, max: 120, default: null },
        amenities: {
            type: [{ type: String, trim: true, maxlength: 60 }],
            default: [],
        },
        alertsEnabled: { type: Boolean, default: true },
    },
    { timestamps: true }
);

savedSearchSchema.index({ renter: 1, updatedAt: -1 });
savedSearchSchema.index({ renter: 1, slot: 1 }, { unique: true });
savedSearchSchema.index(
    { renter: 1, name: 1 },
    { unique: true, collation: { locale: "en", strength: 2 } }
);

export default mongoose.model("SavedSearch", savedSearchSchema);
