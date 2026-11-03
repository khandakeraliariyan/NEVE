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
