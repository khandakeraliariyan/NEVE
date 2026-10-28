import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.resolve(
    __dirname,
    "../../",
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH
);

const serviceAccount = JSON.parse(
    readFileSync(serviceAccountPath, "utf8")
);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

export const firebaseAuth = admin.auth();
export default admin;