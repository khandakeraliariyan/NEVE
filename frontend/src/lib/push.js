"use client";

import { api } from "./api";
import { firebaseApp } from "./firebase";

// Browser push notifications through Firebase Cloud Messaging. Needs the web
// push key from Firebase console > Project settings > Cloud Messaging.
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const SENDER_ID = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const WORKER_URL = "/neve-push-sw.js";
const STORAGE_KEY = "neve.pushToken";

export const pushConfigured = Boolean(firebaseApp && VAPID_KEY && SENDER_ID);

function storedToken() {
    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function storeToken(token) {
    try {
        if (token) window.localStorage.setItem(STORAGE_KEY, token);
        else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage can be blocked; the token then just isn't remembered here.
    }
}

async function messaging() {
    const { getMessaging, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return null;
    return getMessaging(firebaseApp);
}

// "unsupported" | "not_configured" | "blocked" | "on" | "off"
export async function pushStatus() {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
    if (!pushConfigured) return "not_configured";
    if (!(await messaging())) return "unsupported";
    if (Notification.permission === "denied") return "blocked";
    return Notification.permission === "granted" && storedToken() ? "on" : "off";
}

export async function enablePush() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
        throw new Error(permission === "denied" ? "Notifications are blocked for this site in your browser settings." : "Notifications weren't allowed.");
    }
    const instance = await messaging();
    if (!instance) throw new Error("This browser doesn't support push notifications.");
    const registration = await navigator.serviceWorker.register(WORKER_URL);
    await navigator.serviceWorker.ready;
    const { getToken } = await import("firebase/messaging");
    const token = await getToken(instance, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) throw new Error("Couldn't get a push token from Firebase.");
    await api.post("/notifications/push-tokens", { token, platform: "web" });
    storeToken(token);
    return token;
}

// Stops push on this browser. Called on sign-out so a shared computer stops
// receiving the previous person's notifications.
export async function disablePush({ quiet = false } = {}) {
    const token = storedToken();
    if (!token) return;
    try {
        await api.del("/notifications/push-tokens", { body: { token } });
    } catch (error) {
        if (!quiet) throw error;
    }
    try {
        const instance = await messaging();
        if (instance) {
            const { deleteToken } = await import("firebase/messaging");
            await deleteToken(instance);
        }
    } catch {
        // The server no longer has the token, so nothing more is sent.
    }
    storeToken(null);
}
