import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        firebaseUid: {
            type: String,
            required: true,
            unique: true,
            immutable: true,
            index: true,
        },

        email: {
            type: String,
            default: null,
            lowercase: true,
            trim: true,
        },

        displayName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },

        photoURL: {
            type: String,
            default: null,
        },

        // A photo uploaded to Neve. photoURL then points at the stable
        // GET /users/:userId/photo address, which redirects to a signed URL.
        profilePhoto: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UploadedFile",
            default: null,
        },

        phoneNumber: {
            type: String,
            default: null,
            trim: true,
        },

        role: {
            type: String,
            enum: [
                "renter",
                "landlord",
                "legal_reviewer",
                "admin",
            ],
            default: "renter",
            required: true,
        },

        favorites: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Property",
            }
        ],

        recentlyViewed: [
            {
                property: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Property",
                    required: true,
                },
                viewedAt: {
                    type: Date,
                    default: Date.now,
                },
            }
        ],

        isActive: {
            type: Boolean,
            default: true,
        },

        // Admins only: salted scrypt hash of the admin portal password
        // ("scrypt$N$r$p$salt$hash"). Never returned by default.
        passwordHash: {
            type: String,
            default: null,
            select: false,
        },

        // Admin JWTs issued before this moment are refused, so changing the
        // password signs out every existing admin session.
        passwordChangedAt: {
            type: Date,
            default: null,
            select: false,
        },

        notificationPreferences: {
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            // Notification types the user doesn't want sent by email or push.
            // They still appear in the app.
            mutedTypes: { type: [String], default: [] },
            // Optional SMS for viewing reminders and security alerts.
            sms: { type: Boolean, default: false },
            // "daily" holds non-urgent emails for one summary email a day.
            digest: { type: String, enum: ["off", "daily"], default: "off" },
        },

        // Sign-in tracking for security alerts. Never returned by default.
        security: {
            type: {
                // Firebase auth_time (or admin login time) of the latest sign-in seen.
                lastAuthTime: { type: Date, default: null },
                // Firebase moves this forward when the password changes.
                tokensValidAfter: { type: Date, default: null },
                // Admin portal password change last alerted on.
                passwordChangedAt: { type: Date, default: null },
                knownDevices: {
                    type: [
                        {
                            _id: false,
                            fingerprint: { type: String, required: true, maxlength: 64 },
                            label: { type: String, maxlength: 120, default: "" },
                            firstSeenAt: { type: Date, default: Date.now },
                            lastSeenAt: { type: Date, default: Date.now },
                        },
                    ],
                    default: [],
                },
            },
            default: () => ({}),
            select: false,
        },

        // Firebase Cloud Messaging device tokens. Never returned by default.
        pushTokens: {
            type: [
                {
                    _id: false,
                    token: { type: String, required: true, maxlength: 4096 },
                    platform: { type: String, enum: ["web", "android", "ios"], default: "web" },
                    lastSeenAt: { type: Date, default: Date.now },
                },
            ],
            default: [],
            select: false,
        },

        // Email and phone come from Firebase (verified sign-in email, phone
        // number confirmed by Firebase phone auth). Identity is reviewed by an
        // admin from submitted documents.
        verification: {
            email: {
                verified: { type: Boolean, default: false },
                verifiedAt: { type: Date, default: null },
            },
            phone: {
                verified: { type: Boolean, default: false },
                phoneNumber: { type: String, default: null },
                verifiedAt: { type: Date, default: null },
            },
            identity: {
                status: {
                    type: String,
                    enum: ["unverified", "pending", "verified", "rejected"],
                    default: "unverified",
                },
                verifiedAt: { type: Date, default: null },
            },
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

const User = mongoose.model("User", userSchema);

export default User;