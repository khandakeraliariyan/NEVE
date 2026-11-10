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

        // Where photoURL came from. "google" photos are refreshed on each
        // Google sign-in while photoSyncWithGoogle is on.
        photoSource: {
            type: String,
            enum: ["google", "upload", null],
            default: null,
        },
        photoSyncWithGoogle: {
            type: Boolean,
            default: true,
        },
        // Latest Google account photo, kept so sync can be turned back on.
        googlePhotoURL: {
            type: String,
            default: null,
        },

        // Profile details. Addresses and the emergency contact are private
        // (owner and admins only); the rest can appear on the public profile.
        profile: {
            bio: { type: String, trim: true, maxlength: 500, default: "" },
            renter: {
                occupation: { type: String, trim: true, maxlength: 100, default: "" },
                currentAddress: { type: String, trim: true, maxlength: 300, default: "" },
                householdSize: { type: Number, min: 1, max: 20, default: null },
                emergencyContact: {
                    name: { type: String, trim: true, maxlength: 100, default: "" },
                    relationship: { type: String, trim: true, maxlength: 50, default: "" },
                    phone: { type: String, trim: true, maxlength: 20, default: "" },
                },
            },
            landlord: {
                contactAddress: { type: String, trim: true, maxlength: 300, default: "" },
                contactHours: { type: String, trim: true, maxlength: 100, default: "" },
            },
            reviewer: {
                barEnrolmentNumber: { type: String, trim: true, maxlength: 50, default: "" },
                jurisdictions: { type: [{ type: String, trim: true, maxlength: 100 }], default: [] },
                expertise: { type: String, trim: true, maxlength: 300, default: "" },
            },
        },

        // What other users see on the public profile.
        privacy: {
            showPhoto: { type: Boolean, default: true },
            showBadges: { type: Boolean, default: true },
            showBio: { type: Boolean, default: true },
        },

        // Verified identity document. The number and date of birth are
        // AES-256-GCM encrypted; only the last four digits are readable.
        identity: {
            documentType: { type: String, default: null },
            idLast4: { type: String, default: null },
            idNumber: { type: {
                    _id: false,
                    cipherText: String,
                    iv: String,
                    authTag: String,
                    keyVersion: Number,
                }, default: undefined, select: false },
            dateOfBirth: { type: {
                    _id: false,
                    cipherText: String,
                    iv: String,
                    authTag: String,
                    keyVersion: Number,
                }, default: undefined, select: false },
            verifiedAt: { type: Date, default: null },
        },

        // Set when the user deleted their account; the record is anonymised.
        deletedAt: {
            type: Date,
            default: null,
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

        // New admins created by another admin: a one-time link to choose their
        // password. Only a hash of the token is kept.
        adminSetup: {
            type: {
                _id: false,
                tokenHash: { type: String, default: null },
                expiresAt: { type: Date, default: null },
                createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            },
            default: undefined,
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
            // "daily": non-urgent emails are grouped into one daily email.
            digest: { type: String, enum: ["off", "daily"], default: "off" },
            lastDigestAt: { type: Date, default: null },
            // Notification types the user doesn't want sent by email.
            // They still appear in the app.
            mutedTypes: { type: [String], default: [] },
            // Notification types the user doesn't want by email only (set by
            // the unsubscribe link in each email).
            emailMutedTypes: { type: [String], default: [] },
        },

        // Sign-in tracking for security alerts.
        security: {
            // auth_time of the latest sign-in seen by the API.
            lastAuthTime: { type: Date, default: null },
            // Firebase revokes sessions when the password changes; a newer
            // value than this one means the password changed.
            tokensValidAfter: { type: Date, default: null, select: false },
            // auth_time values (seconds) of sessions the user signed out
            // remotely. Requests from them are refused.
            revokedAuthTimes: { type: [Number], default: [] },
            knownDevices: {
                type: [
                    {
                        _id: false,
                        key: { type: String, required: true },
                        label: { type: String, required: true, maxlength: 100 },
                        firstSeenAt: { type: Date, default: Date.now },
                        lastSeenAt: { type: Date, default: Date.now },
                    },
                ],
                default: [],
                select: false,
            },
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
                // How the number was verified: "firebase" (Firebase phone sign-in).
                method: { type: String, enum: ["firebase", null], default: null },
            },
            identity: {
                status: {
                    type: String,
                    enum: ["unverified", "pending", "verified", "rejected"],
                    default: "unverified",
                },
                verifiedAt: { type: Date, default: null },
            },
            // Legal reviewers' professional credentials, checked by an admin.
            credential: {
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