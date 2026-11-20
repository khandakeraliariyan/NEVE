// Plain-language reasons for the most common deployment mistakes, shown by
// GET /api/v1/health/status. Nothing here ever returns a secret or the
// connection string; only a category and a hint.

// Maps a MongoDB connection error to a short cause and what to check.
export function diagnoseDatabaseError(error) {
    const text = `${error?.name ?? ""} ${error?.code ?? ""} ${error?.message ?? ""}`;
    if (/authentication failed|bad auth|AuthenticationFailed|\b18\b/i.test(text)) {
        return { reason: "authentication_failed", hint: "The database user or password in MONGODB_URI is wrong. Check for a leftover <password> placeholder and special characters that need URL-encoding." };
    }
    if (/ENOTFOUND|querySrv|EREFUSED|getaddrinfo/i.test(text)) {
        return { reason: "cluster_not_found", hint: "The cluster address in MONGODB_URI can't be resolved. Copy the connection string again from Atlas." };
    }
    if (/ServerSelection|timed out|ETIMEDOUT|ECONNREFUSED/i.test(text)) {
        return { reason: "cannot_reach_cluster", hint: "The database can't be reached. In Atlas, Network Access must allow 0.0.0.0/0 for Vercel. For a local database, make sure mongod is running." };
    }
    if (/Invalid (scheme|connection string)|URI|must be a string|option .* is not supported/i.test(text)) {
        return { reason: "malformed_uri", hint: "MONGODB_URI is not a valid connection string. It should look like mongodb+srv://user:password@cluster.mongodb.net/neve." };
    }
    return { reason: "unknown", hint: "See the server log for the full error." };
}

// Maps a Firebase Admin start-up error to a cause.
export function diagnoseFirebaseError(error) {
    const text = `${error?.name ?? ""} ${error?.message ?? ""}`;
    if (/not configured|FIREBASE_SERVICE_ACCOUNT/i.test(text) && /missing|not set|required|none/i.test(text)) {
        return { reason: "missing", hint: "Set FIREBASE_SERVICE_ACCOUNT_JSON (the base64 service-account key)." };
    }
    if (/JSON|base64|Unexpected token|parse/i.test(text)) {
        return { reason: "unreadable", hint: "FIREBASE_SERVICE_ACCOUNT_JSON isn't valid base64 or JSON. Paste the whole key again, as one line." };
    }
    if (/private key|PEM|credential/i.test(text)) {
        return { reason: "invalid_key", hint: "The service-account key is incomplete or damaged. Download a fresh key from Firebase and encode it again." };
    }
    return { reason: "unknown", hint: "See the server log for the full error." };
}
