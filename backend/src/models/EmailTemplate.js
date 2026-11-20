import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

// An admin's changes to one notification type's email: its subject, an
// opening paragraph, or turning the email off. The rest of the email (the
// details, buttons and privacy rules) stays as built in.
const emailTemplateSchema = new mongoose.Schema(
    {
        type: { type: String, required: true, unique: true },
        // May use {{title}} (the notification title) and {{name}} (the recipient's name).
        subject: { type: String, trim: true, maxlength: 150, default: "" },
        intro: { type: String, trim: true, maxlength: 1000, default: "" },
        // false: this type is never emailed (in-app only). Security types ignore this.
        emailEnabled: { type: Boolean, default: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true, versionKey: false }
);

export default defineModel("EmailTemplate", emailTemplateSchema);
