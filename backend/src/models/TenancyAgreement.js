import mongoose from "mongoose";

const clauseSchema = new mongoose.Schema(
    {
        heading: { type: String, trim: true, maxlength: 200, default: "" },
        category: {
            type: String,
            enum: [
                "rent",
                "deposit",
                "term",
                "notice",
                "maintenance",
                "utilities",
                "other",
            ],
            default: "other",
        },
        text: { type: String, required: true, trim: true, maxlength: 6000 },
        plainLanguageNote: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: "",
        },
        sourcePage: { type: Number, min: 1, default: null },
        // "user" clauses are typed by a participant. "ai_extracted" clauses are
        // proposals from the extraction service and stay "proposed" until a
        // participant confirms or rejects them.
        origin: {
            type: String,
            enum: ["user", "ai_extracted"],
            default: "user",
        },
        reviewStatus: {
            type: String,
            enum: ["proposed", "confirmed", "rejected"],
            default: "confirmed",
        },
        // Verbatim quote from the agreement file that the clause is based on.
        sourceText: { type: String, trim: true, maxlength: 6000, default: "" },
        // true/false only when the quote could be checked against the file's
        // text; null when the file is a PDF or image and was not machine-checked.
        sourceVerified: { type: Boolean, default: null },
        ambiguityNote: { type: String, trim: true, maxlength: 1000, default: "" },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        reviewedAt: { type: Date, default: null },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

const extractedFactSchema = new mongoose.Schema(
    {
        value: { type: mongoose.Schema.Types.Mixed, default: null },
        sourceText: { type: String, trim: true, maxlength: 2000, default: "" },
        sourcePage: { type: Number, min: 1, default: null },
        sourceVerified: { type: Boolean, default: null },
    },
    { _id: false }
);

const extractionSchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: ["not_run", "completed", "failed"],
            default: "not_run",
        },
        model: { type: String, default: null },
        sourceFile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UploadedFile",
            default: null,
        },
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        extractedAt: { type: Date, default: null },
        documentLanguage: { type: String, maxlength: 60, default: null },
        parties: {
            type: [
                new mongoose.Schema(
                    {
                        role: { type: String, maxlength: 30 },
                        name: { type: String, maxlength: 200 },
                        sourceText: { type: String, maxlength: 2000, default: "" },
                        sourceVerified: { type: Boolean, default: null },
                    },
                    { _id: false }
                ),
            ],
            default: [],
        },
        facts: {
            startAt: { type: extractedFactSchema, default: null },
            endAt: { type: extractedFactSchema, default: null },
            monthlyRentBdt: { type: extractedFactSchema, default: null },
            depositBdt: { type: extractedFactSchema, default: null },
            advanceRentBdt: { type: extractedFactSchema, default: null },
        },
        proposedObligations: {
            type: [
                new mongoose.Schema(
                    {
                        description: { type: String, maxlength: 1000 },
                        responsibleParty: {
                            type: String,
                            enum: ["renter", "landlord", "shared"],
                        },
                        dueDescription: { type: String, maxlength: 300, default: "" },
                        amountBdt: { type: Number, min: 0, default: null },
                        sourceText: { type: String, maxlength: 2000, default: "" },
                        sourcePage: { type: Number, min: 1, default: null },
                        sourceVerified: { type: Boolean, default: null },
                    },
                    { _id: true }
                ),
            ],
            default: [],
        },
        limitations: { type: [String], default: [] },
        failureReason: { type: String, maxlength: 500, default: null },
        usage: {
            inputTokens: { type: Number, default: null },
            outputTokens: { type: Number, default: null },
        },
        latencyMs: { type: Number, default: null },
    },
    { _id: false }
);

const obligationSchema = new mongoose.Schema(
    {
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },
        responsibleParty: {
            type: String,
            enum: ["renter", "landlord", "shared"],
            required: true,
        },
        dueAt: { type: Date, default: null },
        amountBdt: { type: Number, min: 0, default: null },
        evidenceFile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UploadedFile",
            default: null,
        },
        status: {
            type: String,
            enum: ["open", "completed", "disputed"],
            default: "open",
        },
        notes: { type: String, trim: true, maxlength: 1000, default: "" },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

const paymentSchema = new mongoose.Schema(
    {
        paymentType: {
            type: String,
            enum: ["rent", "deposit", "advance", "utilities", "fee", "other"],
            required: true,
        },
        amountBdt: { type: Number, required: true, min: 0.01 },
        paidAt: { type: Date, required: true },
        payer: {
            type: String,
            enum: ["renter", "landlord"],
            required: true,
        },
        reference: { type: String, trim: true, maxlength: 200, default: "" },
        receiptFile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UploadedFile",
            default: null,
        },
        status: {
            type: String,
            enum: ["recorded", "disputed"],
            default: "recorded",
        },
        recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

const sharedUserSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        sharedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        sharedAt: { type: Date, default: Date.now },
        revokedAt: { type: Date, default: null },
    },
    { _id: false }
);

const auditEventSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        action: { type: String, required: true, maxlength: 80 },
        targetType: { type: String, default: "agreement", maxlength: 30 },
        targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
        createdAt: { type: Date, default: Date.now },
        // SHA-256 chain: hash covers this event and prevHash, the previous
        // event's hash. Events from before hashing have neither.
        prevHash: { type: String, default: null },
        hash: { type: String, default: null },
    },
    { _id: false }
);

const tenancyAgreementSchema = new mongoose.Schema(
    {
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            index: true,
        },
        inquiry: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Inquiry",
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
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        documentFile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UploadedFile",
            required: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },
        jurisdiction: {
            type: String,
            enum: ["Bangladesh"],
            default: "Bangladesh",
        },
        startAt: { type: Date, default: null },
        endAt: { type: Date, default: null },
        monthlyRentBdt: { type: Number, min: 0, default: null },
        depositBdt: { type: Number, min: 0, default: null },
        advanceRentBdt: { type: Number, min: 0, default: null },
        status: {
            type: String,
            enum: ["draft", "shared", "under_review", "disputed", "archived"],
            default: "shared",
            index: true,
        },
        clauses: { type: [clauseSchema], default: [] },
        extraction: { type: extractionSchema, default: () => ({}) },
        obligations: { type: [obligationSchema], default: [] },
        payments: { type: [paymentSchema], default: [] },
        sharedWith: { type: [sharedUserSchema], default: [] },
        auditTrail: { type: [auditEventSchema], default: [] },
    },
    { timestamps: true }
);

tenancyAgreementSchema.index({ renter: 1, createdAt: -1 });
tenancyAgreementSchema.index({ landlord: 1, createdAt: -1 });

export default mongoose.model("TenancyAgreement", tenancyAgreementSchema);
