// Creates or promotes a Neve admin account with an email and password login.
//
//   npm run create-admin -- --email admin@example.com --name "Neve Admin"
//
// The password is read from NEVE_ADMIN_PASSWORD, or asked for interactively,
// so it never lands in shell history. Admins can't sign up through the app.
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import mongoose from "mongoose";
import { firebaseAuth } from "../src/config/firebase.js";
import { connectDatabase } from "../src/config/database.js";
import User from "../src/models/User.js";

const MIN_PASSWORD_LENGTH = 12;

function argValue(name) {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

async function askPassword() {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
        return await rl.question(`Admin password (at least ${MIN_PASSWORD_LENGTH} characters): `);
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
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    // Firebase account: create it, or give an existing one this password.
    let firebaseUser;
    try {
        firebaseUser = await firebaseAuth.getUserByEmail(email);
        firebaseUser = await firebaseAuth.updateUser(firebaseUser.uid, {
            password,
            emailVerified: true,
            disabled: false,
        });
        console.log(`Updated the password on the existing Firebase account for ${email}.`);
    } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
        firebaseUser = await firebaseAuth.createUser({
            email,
            password,
            displayName: name,
            emailVerified: true,
        });
        console.log(`Created a Firebase account for ${email}.`);
    }

    await connectDatabase();
    const existing = await User.findOne({ firebaseUid: firebaseUser.uid });
    if (existing && existing.role !== "admin" && !promote) {
        throw new Error(
            `${email} already has a Neve ${existing.role} profile. Re-run with --promote to make it an admin; it will lose its ${existing.role} features.`
        );
    }
    if (existing) {
        existing.role = "admin";
        existing.isActive = true;
        await existing.save();
        console.log(`${email} is now an active admin.`);
    } else {
        await User.create({
            firebaseUid: firebaseUser.uid,
            email,
            displayName: name,
            role: "admin",
        });
        console.log(`Created the Neve admin profile for ${email}.`);
    }
    console.log("Sign in at /admin/sign-in with this email and password.");
}

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
