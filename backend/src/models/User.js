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
                "mediator",
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