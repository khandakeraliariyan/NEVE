import mongoose from "mongoose";

// An identity, property-ownership or legal-reviewer credential verification
// that an admin reviews from private documents. Neve records the review outcome; it never decides
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
            enum: ["identity", "ownership", "credential"],
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
                "bar_enrolment_certificate",
                "practising_certificate",
                "other_credential",
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
        // Identity requests: the document number and date of birth, encrypted.
        // Cleared by the retention purge once the request has been closed for
        // VERIFICATION_DOCUMENT_RETENTION_DAYS.
        identityDetails: {
            idLast4: { type: String, default: null },
            idNumber: {
                type: {
                    _id: false,
                    cipherText: String,
                    iv: String,
                    authTag: String,
                    keyVersion: Number,
                },
                default: undefined,
                select: false,
            },
            dateOfBirth: {
                type: {
                    _id: false,
                    cipherText: String,
                    iv: String,
                    authTag: String,
                    keyVersion: Number,
                },
                default: undefined,
                select: false,
            },
        },
        // Credential requests: what the reviewer claims, for the admin to check.
        credentialDetails: {
            barEnrolmentNumber: { type: String, trim: true, maxlength: 50, default: "" },
            jurisdictions: { type: [String], default: [] },
        },
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
