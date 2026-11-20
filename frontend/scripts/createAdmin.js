// Creates a Neve admin, or sets a new password on an existing one.
//
//   npm run create-admin -- --email admin@example.com --name "Neve Admin"
//
// The password is read from NEVE_ADMIN_PASSWORD, or asked for interactively,
// so it never lands in shell history. Only a salted scrypt hash is stored, in
// MongoDB; admins don't have Firebase sessions. Admins can't sign up through
// the app. Setting a new password signs out the admin's existing sessions.
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import mongoose from "mongoose";
import { connectDatabase } from "../src/server/config/database.js";
import User from "../src/server/models/User.js";
import { hashPassword, MIN_ADMIN_PASSWORD_LENGTH } from "../src/server/services/adminAuth.service.js";
import { enqueueNotificationDelivery } from "../src/server/services/notificationDelivery.service.js";
import { notifyPasswordChanged } from "../src/server/services/securityAlerts.service.js";

function argValue(name) {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

async function askPassword() {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
        return await rl.question(`Admin password (at least ${MIN_ADMIN_PASSWORD_LENGTH} characters): `);
    } finally {
        rl.close();
    }
}

async function main() {
    const email = argValue("email")?.trim().toLowerCase();
    const name = argValue("name")?.trim() || "Neve Admin";
    const promote = process.argv.includes("--promote");
    if (!email || !email.includes("@")) {
        throw new Error('Usage: npm run create-admin -- --email admin@example.com [--name "Neve Admin"] [--promote]');
    }

    const password = process.env.NEVE_ADMIN_PASSWORD ?? (await askPassword());
    if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
        throw new Error(`The password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`);
    }
    const passwordHash = await hashPassword(password);

    await connectDatabase();
    const existing =
        (await User.findOne({ email, role: "admin" })) ?? (await User.findOne({ email }));
    if (existing && existing.role !== "admin" && !promote) {
        throw new Error(
            `${email} already has a Neve ${existing.role} profile. Re-run with --promote to make it an admin; it will lose its ${existing.role} features and can then only sign in through the admin portal.`
        );
    }

    if (existing) {
        existing.role = "admin";
        existing.isActive = true;
        existing.passwordHash = passwordHash;
        existing.passwordChangedAt = new Date();
        await existing.save();
        // Queue the security email; the running API's delivery worker sends it.
        const notification = await notifyPasswordChanged(existing, existing.passwordChangedAt);
        if (notification) await enqueueNotificationDelivery(notification).catch(() => {});
        console.log(`${email} is an active admin with the new password.`);
    } else {
        await User.create({
            // firebaseUid is required and unique; admins have no Firebase account.
            firebaseUid: `neve-admin:${randomUUID()}`,
            email,
            displayName: name,
            role: "admin",
            passwordHash,
            passwordChangedAt: new Date(),
            verification: { email: { verified: true, verifiedAt: new Date() } },
        });
        console.log(`Created the Neve admin ${email}.`);
    }
    console.log("Sign in at /admin/sign-in with this email and password.");
}

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
