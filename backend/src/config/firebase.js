import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "./env.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is missing from the environment.");
}

const serviceAccountPath = path.resolve(
    __dirname,
    "../../",
    env.FIREBASE_SERVICE_ACCOUNT_PATH
);

const serviceAccount = JSON.parse(
    readFileSync(serviceAccountPath, "utf8")
);

const firebaseApp = getApps().length
    ? getApp()
    : initializeApp({
          credential: cert(serviceAccount),
      });

export const firebaseAuth = getAuth(firebaseApp);
export { firebaseApp };