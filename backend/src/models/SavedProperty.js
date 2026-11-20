import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

const savedPropertySchema = new mongoose.Schema(
    {
        renter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            index: true,
        },
    },
    { timestamps: true }
);

// A renter can save a particular property only once.
savedPropertySchema.index(
    { renter: 1, property: 1 },
    { unique: true }
);

export default defineModel("SavedProperty", savedPropertySchema);