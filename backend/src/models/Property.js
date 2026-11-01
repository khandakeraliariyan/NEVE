import mongoose from "mongoose";

const propertyManagerAssignmentSchema = new mongoose.Schema(
    {
        manager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        assignedAt: { type: Date, default: Date.now },
        revokedAt: { type: Date, default: null },
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

        managerAssignments: {
            type: [propertyManagerAssignmentSchema],
            default: [],
            select: false,
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
            enum: ["apartment", "house", "room", "shared_accommodation"],
            required: true,
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
            enum: ["furnished", "semi_furnished", "unfurnished"],
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

            oneTimeFees: {
                type: Number,
                default: null,
                min: 0,
            },

            monthlyServiceCharge: {
                type: Number,
                default: null,
                min: 0,
            },

            estimatedMonthlyUtilities: {
                type: Number,
                default: null,
                min: 0,
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
            enum: ["draft", "published", "paused"],
            default: "draft",
            index: true,
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
propertySchema.index({ "managerAssignments.manager": 1, status: 1 });

const Property = mongoose.model("Property", propertySchema);

export default Property;