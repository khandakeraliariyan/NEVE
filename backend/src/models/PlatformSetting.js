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
        // Switch external services off without a deploy.
        integrations: {
            aiEnabled: { type: Boolean, default: true },
            emailEnabled: { type: Boolean, default: true },
        },
        // Optional capabilities per role. Core role rules stay in code.
        rolePermissions: {
            copilotRoles: { type: [String], default: ["renter", "landlord", "legal_reviewer"] },
            reviewersCanDraftSources: { type: Boolean, default: true },
            reviewersCanSeeAiEvaluations: { type: Boolean, default: true },
            landlordsCanInviteRenters: { type: Boolean, default: true },
        },
        // Retention and backup limits. null means "use the server's
        // environment default" (ACCOUNT_DELETION_FILE_RETENTION_DAYS etc.).
        dataPolicies: {
            accountDeletionFileRetentionDays: { type: Number, min: 0, max: 3650, default: null },
            verificationDocumentRetentionDays: { type: Number, min: 1, max: 3650, default: null },
            abandonedUploadHours: { type: Number, min: 1, max: 720, default: null },
            backupRetentionCount: { type: Number, min: 1, max: 365, default: null },
        },
        // The privacy policy shown to everyone. Each change gets a new version.
        privacyPolicy: {
            version: { type: Number, min: 1, default: 1 },
            text: { type: String, trim: true, maxlength: 20000, default: "" },
            updatedAt: { type: Date, default: null },
        },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true, versionKey: false }
);

export default mongoose.model("PlatformSetting", platformSettingSchema);
