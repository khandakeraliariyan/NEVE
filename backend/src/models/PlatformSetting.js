import mongoose from "mongoose";

// Platform settings an admin changes without a deploy. One document
// (_id "platform").
const platformSettingSchema = new mongoose.Schema(
    {
        _id: { type: String, default: "platform" },
        // A notice shown at the top of every page.
        announcement: {
            enabled: { type: Boolean, default: false },
            text: { type: String, trim: true, maxlength: 300, default: "" },
            tone: { type: String, enum: ["info", "warning"], default: "info" },
        },
        // Shown in email footers and on help messages.
        supportEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
        // Added to the bottom of every notification email.
        emailFooter: { type: String, trim: true, maxlength: 500, default: "" },
        // Hours before a landlord is reminded about an unanswered inquiry.
        inquiryReminderHours: { type: Number, min: 6, max: 168, default: 24 },
        // Days a landlord's tenancy invitation stays open.
        invitationExpiryDays: { type: Number, min: 1, max: 60, default: 14 },
        // New sign-ups may choose renter or landlord; turn off to pause sign-ups as landlord.
        landlordSignupsOpen: { type: Boolean, default: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true, versionKey: false }
);

export default mongoose.model("PlatformSetting", platformSettingSchema);
