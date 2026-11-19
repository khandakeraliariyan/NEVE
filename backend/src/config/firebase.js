import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "./env.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseServiceAccountJson } from "./serviceAccount.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadServiceAccount() {
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON) return parseServiceAccountJson(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const serviceAccountPath = path.resolve(__dirname, "../../", env.FIREBASE_SERVICE_ACCOUNT_PATH);
    return JSON.parse(readFileSync(serviceAccountPath, "utf8"));
}

const firebaseApp = getApps().length
    ? getApp()
    : initializeApp({
          credential: cert(loadServiceAccount()),
      });

export const firebaseAuth = getAuth(firebaseApp);
export { firebaseApp };
