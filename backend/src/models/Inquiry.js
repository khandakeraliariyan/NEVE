import mongoose from "mongoose";

const inquirySchema = new mongoose.Schema(
    {
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            index: true,
        },

        renter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        landlord: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },

        status: {
            type: String,
            enum: [
                "pending",
                "accepted",
                "declined",
                "submitted",
                "acknowledged",
                "responded",
                "closed",
            ],
            default: "pending",
            index: true,
        },

        landlordResponse: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        respondedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

const Inquiry = mongoose.model("Inquiry", inquirySchema);

export default Inquiry;