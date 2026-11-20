import { env } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { apiLimiter } from "../middleware/rateLimit.middleware.js";
import { getSettings } from "../services/platformSettings.service.js";
import { recordSystemError } from "../services/systemErrors.service.js";
import { attachWebRequest, createRequest, matchPattern, readJsonBody } from "./request.js";
import { ApiResponse } from "./response.js";
import { buildEndpoints } from "./router.js";

// Runs the API inside Next.js. Each route file under src/app/api passes its
// requests to apiRoutes(...)/apiHandler(endpoints), which finds the endpoint
// (first match wins) and runs it with route(pattern, ...handlers).
// The handlers run in order with the (req, res, next) contract the
// controllers and middleware are written for. Every request first gets the
// API security headers, the general rate limit, a database connection and
// JSON body parsing; errors end in the central error handler.

// Response headers for API responses (the same set Helmet sent).
const SECURITY_HEADERS = {
    "Content-Security-Policy":
        "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Origin-Agent-Cluster": "?1",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-DNS-Prefetch-Control": "off",
    "X-Download-Options": "noopen",
    "X-Frame-Options": "SAMEORIGIN",
    "X-Permitted-Cross-Domain-Policies": "none",
    "X-XSS-Protection": "0",
};

const UNAVAILABLE = {
    success: false,
    message: "The service is temporarily unavailable. Please try again shortly.",
};

const NOT_FOUND = { success: false, message: "Route not found" };

// Opens the database connection (reused while the instance stays warm) and
// loads platform settings. The health check doesn't need either.
async function defaultPreflight(req, res, next) {
    if (req.path === "/api/v1/health") return next();
    try {
        await connectDatabase();
        await getSettings();
    } catch (error) {
        console.error("Database unavailable:", error.message ?? error);
        return res.status(503).json(UNAVAILABLE);
    }
    return next();
}

let preflight = defaultPreflight;

// Tests replace the database step; pass null to restore it.
export function setPreflight(handler) {
    preflight = handler ?? defaultPreflight;
}

function errorResponse(error, req, res) {
    console.error(error);

    const statusCode =
        Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;

    // Server-side failures are kept for admins to review; client errors are not.
    if (statusCode >= 500) {
        recordSystemError({ error, req, status: statusCode });
    }

    return res.status(statusCode).json({
        success: false,
        message:
            statusCode < 500
                ? error.message
                : typeof error?.publicMessage === "string"
                    ? error.publicMessage
                    : "Internal server error.",
    });
}

// Runs handlers like an Express stack: next() moves on, next(error) skips to
// the error handler, and a rejected promise counts as next(error). Resolves
// once the response is finished.
function runStack(handlers, req, res) {
    return new Promise((resolve) => {
        let settled = false;
        const settle = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        res.finishedPromise.then(settle);

        const fail = (error) => {
            if (res.finished) {
                console.error("Error after the response was sent:", error);
                return settle();
            }
            errorResponse(error, req, res);
        };

        let index = 0;
        const next = (error) => {
            if (settled || res.finished) return;
            if (error !== undefined && error !== null && error !== "route" && error !== "router") {
                return fail(error);
            }
            const handler = handlers[index];
            index += 1;
            if (!handler) {
                res.status(404).json(NOT_FOUND);
                return;
            }
            try {
                const result = handler(req, res, next);
                if (result && typeof result.then === "function") result.then(undefined, fail);
            } catch (caught) {
                fail(caught);
            }
        };
        next();
    });
}

export function route(pattern, ...handlers) {
    async function handler(request) {
        const res = new ApiResponse();
        res.set(SECURITY_HEADERS);

        let req;
        try {
            const pathname = new URL(request.url).pathname;
            const params = (pattern && matchPattern(pattern, pathname)) ?? {};
            req = attachWebRequest(createRequest(request, { pattern, params, trustProxyHops: env.TRUST_PROXY_HOPS }), request);
        } catch (error) {
            req ??= { method: request.method, url: request.url, headers: {}, params: {}, query: {} };
            errorResponse(error, req, res);
            return res.toResponse();
        }

        const parseBody = async (req, res, next) => {
            await readJsonBody(request, req);
            next();
        };

        // Without a pattern (the 404 fallback) only the rate limit applies.
        const steps = pattern === null ? [apiLimiter] : [apiLimiter, preflight, parseBody];
        await runStack([...steps, ...handlers], req, res);
        return res.toResponse({ omitBody: request.method === "HEAD" });
    }
    return handler;
}

// A JSON 404 for API paths no endpoint matches.
export const notFound = route(null);

function matches(pattern, pathname) {
    try {
        return matchPattern(pattern, pathname) !== null;
    } catch {
        // A badly encoded parameter: the endpoint answers 400.
        return true;
    }
}

// The first endpoint whose method and path match, as in Express. HEAD
// requests use the GET endpoint.
export function findEndpoint(endpoints, method, pathname) {
    const wanted = method === "HEAD" ? "GET" : method;
    return endpoints.find((endpoint) => endpoint.method === wanted && matches(endpoint.pattern, pathname)) ?? null;
}

// One Next.js route handler for the whole API (src/app/api/[...path]/route.js).
export function apiHandler(endpoints) {
    const handlers = new Map(endpoints.map((endpoint) => [endpoint, route(endpoint.pattern, ...endpoint.handlers)]));
    return async function handleApiRequest(request) {
        const endpoint = findEndpoint(endpoints, request.method, new URL(request.url).pathname);
        return endpoint ? handlers.get(endpoint)(request) : notFound(request);
    };
}

// The handler for one API area. Each area's routes live in its Next.js route
// file, app/api/v1/<area>/[[...path]]/route.js, declared with Router(); the
// file exports this handler for every HTTP method:
//
//   const handler = apiRoutes([{ prefix: "/api/v1/reviews", router }]);
//   export const GET = handler; // and POST, PUT, PATCH, DELETE, HEAD
export function apiRoutes(mounts) {
    const endpoints = buildEndpoints(mounts);
    const handler = apiHandler(endpoints);
    // Lets tests list every endpoint of every route file.
    handler.endpoints = endpoints;
    return handler;
}
