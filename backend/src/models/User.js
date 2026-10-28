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
                "property_manager",
                "mediator",
                "legal_reviewer",
                "admin",
            ],
            default: "renter",
            required: true,
        },

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