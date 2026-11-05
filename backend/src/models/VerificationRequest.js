import mongoose from "mongoose";

// An identity or property-ownership verification that an admin reviews from
// private documents. Neve records the review outcome; it never decides
// verification automatically.
const verificationRequestSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ["identity", "ownership"],
            required: true,
        },
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            default: null,
            index: true,
        },
        documentType: {
            type: String,
            enum: [
                "national_id",
                "passport",
                "driving_licence",
                "birth_certificate",
                "title_deed",
                "mutation_record",
                "utility_bill",
                "holding_tax_receipt",
                "management_authorisation",
                "other",
            ],
            required: true,
        },
        documents: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" }],
            validate: {
                validator: (value) => value.length >= 1 && value.length <= 10,
                message: "Attach between 1 and 10 documents.",
            },
        },
        note: { type: String, trim: true, maxlength: 1000, default: "" },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected", "cancelled"],
            default: "pending",
            index: true,
        },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
        // Shown to the requester.
        reviewNote: { type: String, trim: true, maxlength: 1000, default: "" },
    },
    { timestamps: true, versionKey: false }
);

// One open request per user, type and property.
verificationRequestSchema.index(
    { user: 1, type: 1, property: 1 },
    { unique: true, partialFilterExpression: { status: "pending" } }
);

const VerificationRequest = mongoose.model("VerificationRequest", verificationRequestSchema);

export default VerificationRequest;
