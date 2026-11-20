import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

// A person contesting an account decision, or raising a complaint about
// their account, for an admin to review.
// - account_suspension: the account was deactivated (works while suspended)
// - verification_decision: a rejected identity/ownership/credential request
// - account_complaint: any other account-related problem

export const APPEAL_TYPES = ["account_suspension", "verification_decision", "account_complaint"];
export const APPEAL_STATUSES = ["pending", "accepted", "rejected"];

const accountAppealSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        type: { type: String, enum: APPEAL_TYPES, required: true },
        verificationRequest: { type: mongoose.Schema.Types.ObjectId, ref: "VerificationRequest", default: null },
        message: { type: String, required: true, trim: true, minlength: 20, maxlength: 2000 },
        // The suspension reason at the time of a suspension appeal.
        suspensionReason: { type: String, trim: true, maxlength: 500, default: "" },
        status: { type: String, enum: APPEAL_STATUSES, default: "pending", index: true },
        decision: {
            by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            note: { type: String, trim: true, maxlength: 2000, default: "" },
            at: { type: Date, default: null },
            // For accepted suspension appeals: whether the account was reactivated.
            accountReactivated: { type: Boolean, default: false },
        },
    },
    { timestamps: true, versionKey: false }
);

// One open appeal of each type per person.
accountAppealSchema.index(
    { user: 1, type: 1 },
    { unique: true, partialFilterExpression: { status: "pending" } }
);
accountAppealSchema.index({ status: 1, createdAt: -1 });

const AccountAppeal = defineModel("AccountAppeal", accountAppealSchema);

export default AccountAppeal;
