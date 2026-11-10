import mongoose from "mongoose";

// A document in an agreement's evidence vault: amendments, receipts,
// photos, notices, correspondence and more. Files are never replaced: a new
// upload adds a version, and earlier versions stay readable with their
// SHA-256 hashes, so changes are traceable. "private" documents are visible
// only to the person who added them; "shared" ones to both parties and to
// legal reviewers the agreement is shared with.

export const DOCUMENT_CATEGORIES = [
    "agreement",
    "amendment",
    "receipt",
    "photo",
    "notice",
    "correspondence",
    "maintenance_record",
    "supporting",
    "other",
];
export const NOTICE_TYPES = ["termination", "rent_change", "repair", "entry", "renewal", "payment_reminder", "other"];
export const DOCUMENT_RESPONSES = ["acknowledged", "accepted", "rejected"];

const versionSchema = new mongoose.Schema(
    {
        version: { type: Number, required: true, min: 1 },
        file: { type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile", required: true },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        uploadedAt: { type: Date, default: Date.now },
        note: { type: String, trim: true, maxlength: 1000, default: "" },
    },
    { _id: false }
);

const historySchema = new mongoose.Schema(
    {
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        action: { type: String, required: true, maxlength: 60 },
        detail: { type: String, maxlength: 500, default: "" },
        at: { type: Date, default: Date.now },
    },
    { _id: false }
);

const tenancyDocumentSchema = new mongoose.Schema(
    {
        agreement: { type: mongoose.Schema.Types.ObjectId, ref: "TenancyAgreement", required: true, index: true },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        category: { type: String, enum: DOCUMENT_CATEGORIES, required: true, index: true },
        title: { type: String, trim: true, required: true, maxlength: 200 },
        description: { type: String, trim: true, maxlength: 2000, default: "" },
        visibility: { type: String, enum: ["private", "shared"], default: "shared" },
        // When the document takes effect (amendments) or the notice date.
        effectiveAt: { type: Date, default: null },
        notice: {
            noticeType: { type: String, enum: [...NOTICE_TYPES, null], default: null },
            servedAt: { type: Date, default: null },
            responseDueAt: { type: Date, default: null },
        },
        // Amendments are accepted or rejected by the other party; notices
        // are acknowledged.
        responses: {
            type: [
                {
                    _id: false,
                    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
                    response: { type: String, enum: DOCUMENT_RESPONSES, required: true },
                    note: { type: String, maxlength: 1000, default: "" },
                    at: { type: Date, default: Date.now },
                },
            ],
            default: [],
        },
        versions: { type: [versionSchema], default: [] },
        history: { type: [historySchema], default: [] },
        archivedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

tenancyDocumentSchema.index({ agreement: 1, category: 1, createdAt: -1 });
tenancyDocumentSchema.index({ "versions.file": 1 });

export default mongoose.model("TenancyDocument", tenancyDocumentSchema);
