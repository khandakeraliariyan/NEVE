import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Public pages still work when Firebase isn't configured; sign-in shows a notice.
export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

export const auth = firebaseConfigured ? getAuth(initializeApp(config)) : null;
