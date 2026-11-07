import mongoose from "mongoose";
import {
    BATHROOM_TYPES,
    OCCUPANT_GENDERS,
    PROPERTY_TYPES,
    SHARED_FACILITIES,
    SHARED_PROPERTY_TYPES,
} from "../constants/propertyTypes.js";

const sharedAccommodationSchema = new mongoose.Schema(
    {
        totalOccupants: { type: Number, min: 1, max: 50, validate: Number.isInteger },
        availableSpots: { type: Number, min: 1, max: 50, validate: Number.isInteger },
        occupantGender: { type: String, enum: OCCUPANT_GENDERS, default: "any" },
        bathroomType: { type: String, enum: BATHROOM_TYPES, default: null },
        sharedFacilities: {
            type: [{ type: String, enum: SHARED_FACILITIES }],
            default: [],
        },
    },
    { _id: false }
);

export const UTILITY_TYPES = [
    "electricity",
    "gas",
    "water",
    "internet",
    "waste_collection",
    "other",
];

// included:       covered by the rent; no separate charge.
// fixed:          the same landlord-stated amount every month.
// estimated:      varies with use; the amount is the landlord's monthly estimate.
// not_disclosed:  the renter pays it, but no amount has been given.
export const UTILITY_BILLING = ["included", "fixed", "estimated", "not_disclosed"];

const utilitySchema = new mongoose.Schema(
    {
        utility: { type: String, enum: UTILITY_TYPES, required: true },
        label: {
            type: String,
            trim: true,
            maxlength: 60,
            default: "",
            validate: {
                validator(value) {
                    return this.utility !== "other" || Boolean(value?.trim());
                },
                message: "Name the utility when its type is \"other\"",
            },
        },
        billing: { type: String, enum: UTILITY_BILLING, required: true },
        monthlyAmount: {
            type: Number,
            min: 0,
            default: null,
            validate: {
                validator(value) {
                    const needsAmount = ["fixed", "estimated"].includes(this.billing);
                    return needsAmount ? value !== null && value !== undefined : value == null;
                },
                message:
                    "Fixed and estimated utilities need a monthly amount; included and undisclosed utilities must not have one",
            },
        },
        notes: { type: String, trim: true, maxlength: 200, default: "" },
    },
    { _id: false }
);

const otherFeeSchema = new mongoose.Schema(
    {
        name: { type: String, trim: true, required: true, maxlength: 80 },
        amount: { type: Number, required: true, min: 0 },
        frequency: { type: String, enum: ["one_time", "monthly"], required: true },
        refundable: {
            type: Boolean,
            default: false,
            validate: {
                validator(value) {
                    return !value || this.frequency === "one_time";
                },
                message: "Only one-time fees can be refundable",
            },
        },
        notes: { type: String, trim: true, maxlength: 200, default: "" },
    },
    { _id: false }
);

const propertySchema = new mongoose.Schema(
    {
        landlord: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },

        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000,
        },

        propertyType: {
            type: String,
            enum: PROPERTY_TYPES,
            required: true,
        },

        // Only for "room" and "shared_room" listings.
        sharedAccommodation: {
            type: sharedAccommodationSchema,
            default: null,
            validate: [
                {
                    validator(value) {
                        return (
                            !value ||
                            value.availableSpots == null ||
                            value.totalOccupants == null ||
                            value.availableSpots <= value.totalOccupants
                        );
                    },
                    message: "availableSpots cannot exceed totalOccupants",
                },
                {
                    validator(value) {
                        return !value || SHARED_PROPERTY_TYPES.includes(this.propertyType);
                    },
                    message: "sharedAccommodation is only for room and shared_room listings",
                },
            ],
        },

        address: {
            area: { type: String, required: true, trim: true },
            city: { type: String, required: true, trim: true },
            country: { type: String, default: "Bangladesh", trim: true },
            location: {
                type: {
                    type: String,
                    enum: ["Point"],
                },
                coordinates: {
                    type: [Number],
                    validate: {
                        validator(value) {
                            return (
                                value === undefined ||
                                (value.length === 2 &&
                                    value.every(Number.isFinite) &&
                                    value[0] >= -180 &&
                                    value[0] <= 180 &&
                                    value[1] >= -90 &&
                                    value[1] <= 90)
                            );
                        },
                        message: "Coordinates must be [longitude, latitude]",
                    },
                },
            },
        },

        bedrooms: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
            validate: Number.isInteger,
        },

        bathrooms: {
            type: Number,
            required: true,
            min: 1,
            max: 100,
            validate: Number.isInteger,
        },

        areaSqft: {
            type: Number,
            min: 1,
        },

        floor: {
            type: Number,
            min: 0,
        },

        furnishing: {
            type: String,
            enum: ["furnished", "unfurnished"],
            required: true,
        },

        location: {
            latitude: {
                type: Number,
                min: -90,
                max: 90,
            },
            longitude: {
                type: Number,
                min: -180,
                max: 180,
            },
        },

        amenities: {
            type: [{ type: String, trim: true, maxlength: 60 }],
            default: [],
            validate: {
                validator(value) {
                    return value.length <= 50;
                },
                message: "A maximum of 50 amenities is allowed",
            },
        },

        images: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "UploadedFile",
                },
            ],
            default: [],
            validate: {
                validator(value) {
                    return value.length <= 20;
                },
                message: "A maximum of 20 property images is allowed",
            },
        },

        videos: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "UploadedFile",
                },
            ],
            default: [],
            validate: {
                validator(value) {
                    return value.length <= 5;
                },
                message: "A maximum of 5 property videos is allowed",
            },
        },

        floorPlans: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "UploadedFile",
                },
            ],
            default: [],
            validate: {
                validator(value) {
                    return value.length <= 5;
                },
                message: "A maximum of 5 floor plans is allowed",
            },
        },

        pricing: {
            monthlyRent: {
                type: Number,
                required: true,
                min: 1,
            },

            securityDeposit: {
                type: Number,
                default: null,
                min: 0,
            },

            advanceRent: {
                type: Number,
                default: null,
                min: 0,
            },

            monthlyServiceCharge: {
                type: Number,
                default: null,
                min: 0,
            },

            // How each utility is paid. An empty list means the landlord has
            // not described utilities; it does not mean they are free.
            utilities: {
                type: [utilitySchema],
                default: [],
                validate: [
                    {
                        validator: (items) => items.length <= 8,
                        message: "A maximum of 8 utilities is allowed",
                    },
                    {
                        validator: (items) => {
                            const keys = items.map((item) =>
                                item.utility === "other"
                                    ? `other:${(item.label || "").trim().toLowerCase()}`
                                    : item.utility
                            );
                            return new Set(keys).size === keys.length;
                        },
                        message: "Each utility can only be listed once",
                    },
                ],
            },

            otherFees: {
                type: [otherFeeSchema],
                default: [],
                validate: {
                    validator: (items) => items.length <= 10,
                    message: "A maximum of 10 other fees is allowed",
                },
            },
        },

        availabilityDate: {
            type: Date,
            default: null,
        },

        leaseDurationMonths: {
            type: Number,
            min: 1,
            max: 120,
        },

        houseRules: {
            type: [String],
            default: [],
        },

        status: {
            type: String,
            enum: ["draft", "published", "paused", "deleted"],
            default: "draft",
            index: true,
        },

        deletedAt: {
            type: Date,
            default: null,
        },

        // Set only by an admin after reviewing ownership documents.
        ownershipVerification: {
            status: {
                type: String,
                enum: ["unverified", "pending", "verified", "rejected"],
                default: "unverified",
            },
            verifiedAt: { type: Date, default: null },
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

propertySchema.index({
    "address.city": 1,
    status: 1,
    "pricing.monthlyRent": 1,
});

propertySchema.index({ "address.location": "2dsphere" });

// Deleted listings are kept for renters' history (inquiries, reviews, tenancy
// records) but hidden from every query unless the query names a status itself
// or passes { includeDeleted: true } as a query option.
function excludeDeleted() {
    if (this.getOptions().includeDeleted) return;
    if (this.getFilter().status !== undefined) return;
    this.where({ status: { $ne: "deleted" } });
}

propertySchema.pre(
    [
        "find",
        "findOne",
        "countDocuments",
        "distinct",
        "findOneAndUpdate",
        "updateOne",
        "updateMany",
    ],
    excludeDeleted
);

propertySchema.pre("aggregate", function () {
    if (this.options?.includeDeleted) return;
    const pipeline = this.pipeline();
    // $geoNear (and $search) must stay the first stage.
    const at = pipeline[0]?.$geoNear || pipeline[0]?.$search ? 1 : 0;
    pipeline.splice(at, 0, { $match: { status: { $ne: "deleted" } } });
});

const Property = mongoose.model("Property", propertySchema);

export default Property;