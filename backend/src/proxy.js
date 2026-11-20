import { NextResponse } from "next/server.js";

// CORS for the API: only the frontend (CLIENT_URL) may call it from a
// browser, with credentials so the admin session cookie is sent. Preflight
// requests are answered here, before rate limits and route handlers.

const ALLOWED_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
// X-Neve-Admin marks admin portal requests (CSRF check for the session cookie).
const ALLOWED_HEADERS = "Content-Type,Authorization,X-Neve-Admin";

export function proxy(request) {
    const allowedOrigin = process.env.CLIENT_URL ? new URL(process.env.CLIENT_URL).origin : null;
    const corsHeaders = allowedOrigin
        ? { "Access-Control-Allow-Origin": allowedOrigin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" }
        : {};

    if (request.method === "OPTIONS") {
        return new NextResponse(null, {
            status: 204,
            headers: {
                ...corsHeaders,
                "Access-Control-Allow-Methods": ALLOWED_METHODS,
                "Access-Control-Allow-Headers": ALLOWED_HEADERS,
                "Content-Length": "0",
            },
        });
    }

    const response = NextResponse.next();
    for (const [name, value] of Object.entries(corsHeaders)) response.headers.set(name, value);
    return response;
}

export const config = {
    matcher: "/api/:path*",
};
