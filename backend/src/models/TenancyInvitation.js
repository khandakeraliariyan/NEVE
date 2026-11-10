import mongoose from "mongoose";

// A landlord's invitation to a renter to start a tenancy record for one of
// their properties. The renter accepts it while signed in with the invited
// email address, which creates the agreement.
const tenancyInvitationSchema = new mongoose.Schema(
    {
        property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
        landlord: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        inviteeEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, index: true },
        // Set once the invitee is known (on acceptance or decline).
        invitee: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        title: { type: String, required: true, trim: true, maxlength: 150 },
        message: { type: String, trim: true, maxlength: 1000, default: "" },
        startAt: { type: Date, default: null },
        endAt: { type: Date, default: null },
        monthlyRentBdt: { type: Number, min: 0, default: null },
        depositBdt: { type: Number, min: 0, default: null },
        advanceRentBdt: { type: Number, min: 0, default: null },
        // Optional signed agreement the landlord uploaded (tenancy_evidence).
        documentFile: { type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile", default: null },
        status: {
            type: String,
            enum: ["pending", "accepted", "declined", "cancelled", "expired"],
            default: "pending",
            index: true,
        },
        expiresAt: { type: Date, required: true },
        respondedAt: { type: Date, default: null },
        declineReason: { type: String, trim: true, maxlength: 500, default: "" },
        agreement: { type: mongoose.Schema.Types.ObjectId, ref: "TenancyAgreement", default: null },
        // How the invitee was told: "in_app" (has an account), "email", or "link_only".
        delivery: { type: String, enum: ["in_app", "email", "link_only"], default: "link_only" },
    },
    { timestamps: true, versionKey: false }
);

// One open invitation per property and email.
tenancyInvitationSchema.index(
    { property: 1, inviteeEmail: 1 },
    { unique: true, partialFilterExpression: { status: "pending" } }
);

export default mongoose.model("TenancyInvitation", tenancyInvitationSchema);
