import mongoose from "mongoose";

const viewingRequestSchema = new mongoose.Schema(
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

        requestedDate: {
            type: Date,
            required: true,
        },

        message: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        status: {
            type: String,
            enum: [
                "requested",
                "confirmed",
                "declined",
                "cancelled",
                "completed",
            ],
            default: "requested",
            index: true,
        },

        landlordNote: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

viewingRequestSchema.index({
    landlord: 1,
    requestedDate: 1,
    status: 1,
});

const ViewingRequest = mongoose.model(
    "ViewingRequest",
    viewingRequestSchema
);

export default ViewingRequest;