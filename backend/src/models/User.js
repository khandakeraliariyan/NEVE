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
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

const User = mongoose.model("User", userSchema);

export default User;