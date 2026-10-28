import mongoose from "mongoose";

const costItemSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },

        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        type: {
            type: String,
            enum: [
                "monthly",
                "one_time",
                "refundable_deposit",
                "monthly_estimate",
            ],
            required: true,
        },

        required: {
            type: Boolean,
            default: false,
        },

        notes: {
            type: String,
            maxlength: 500,
            default: "",
        },
    },
    { _id: true }
);

const rentalCostSchema = new mongoose.Schema(
    {
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            unique: true,
            index: true,
        },

        currency: {
            type: String,
            default: "BDT",
            enum: ["BDT"],
        },

        items: {
            type: [costItemSchema],
            default: [],
            validate: {
                validator: (items) => items.length <= 50,
                message: "A maximum of 50 cost items is allowed.",
            },
        },

        unknownCosts: {
            type: [String],
            default: [],
            validate: {
                validator: (items) =>
                    items.length <= 20 &&
                    items.every(
                        (item) =>
                            typeof item === "string" &&
                            item.trim().length > 0 &&
                            item.length <= 100
                    ),
                message: "Invalid unknown-cost entries.",
            },
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

export default mongoose.model("RentalCost", rentalCostSchema);