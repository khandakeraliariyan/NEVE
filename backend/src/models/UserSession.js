import mongoose from "mongoose";

// One sign-in (a Firebase auth_time, or an admin token) and where it was
// used from. Doubles as the login history; removed 90 days after last use.
const userSessionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        // Sign-in time in seconds, from the token's auth_time (iat for admins).
        authTime: { type: Number, required: true },
        signInProvider: { type: String, default: null },
        deviceLabel: { type: String, maxlength: 100, default: "Unknown device" },
        // Shortened IP address ("203.0.113.x"), never the full address.
        ipPrefix: { type: String, maxlength: 60, default: null },
        signedInAt: { type: Date, required: true },
        lastSeenAt: { type: Date, required: true },
        revokedAt: { type: Date, default: null },
        purgeAt: { type: Date, required: true },
    },
    { versionKey: false }
);

userSessionSchema.index({ user: 1, authTime: 1 }, { unique: true });
userSessionSchema.index({ user: 1, signedInAt: -1 });
userSessionSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("UserSession", userSessionSchema);
