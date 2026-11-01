import mongoose from "mongoose";

const inquiryMessageSchema = new mongoose.Schema(
    {
        inquiry: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Inquiry",
            required: true,
            index: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        body: {
            type: String,
            required: true,
            trim: true,
            maxlength: 4000,
        },
        readAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

inquiryMessageSchema.index({ inquiry: 1, createdAt: -1 });
inquiryMessageSchema.index({ recipient: 1, readAt: 1 });

export default mongoose.model("InquiryMessage", inquiryMessageSchema);
