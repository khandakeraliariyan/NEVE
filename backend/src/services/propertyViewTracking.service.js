import { env } from "../config/env.js";

const API_BASE_URL = env.NEVE_API_BASE_URL;

export async function recordPropertyView(propertyId, firebaseIdToken) {
    if (!propertyId || !firebaseIdToken) {
        throw new Error("Property ID and Firebase ID token are required.");
    }

    const response = await fetch(
        `${API_BASE_URL}/users/me/recently-viewed/${encodeURIComponent(propertyId)}`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${firebaseIdToken}`,
                "Content-Type": "application/json",
            },
        }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Failed to record property view.");
    }

    return data;
}
