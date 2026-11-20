import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "./env.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseServiceAccountJson } from "./serviceAccount.js";

function loadServiceAccount() {
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON) return parseServiceAccountJson(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    // Relative paths are relative to the app folder, where Next.js runs.
    const serviceAccountPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
    return JSON.parse(readFileSync(serviceAccountPath, "utf8"));
}

let auth = null;

// Firebase Admin starts on first use, not on import, so building the app and
// loading modules don't need the credentials.
export function getFirebaseAuth() {
    if (!auth) {
        const firebaseApp = getApps().length ? getApp() : initializeApp({ credential: cert(loadServiceAccount()) });
        auth = getAuth(firebaseApp);
    }
    return auth;
}

// Use like the Auth instance itself: firebaseAuth.verifyIdToken(token).
export const firebaseAuth = new Proxy(
    {},
    {
        get(_target, property) {
            const instance = getFirebaseAuth();
            const value = Reflect.get(instance, property, instance);
            return typeof value === "function" ? value.bind(instance) : value;
        },
    }
);
