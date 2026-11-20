import querystring from "node:querystring";

// Builds the request object controllers and middleware read from a Web
// Request: method, headers, params, query, body, ip and get(). It covers the
// part of the Express request API the API uses.

// Matches a path such as /api/v1/properties/abc against a pattern such as
// /api/v1/properties/:id. Returns the decoded params, or null on no match.
export function matchPattern(pattern, pathname) {
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (patternParts.length !== pathParts.length) return null;
    const params = {};
    for (let index = 0; index < patternParts.length; index += 1) {
        const expected = patternParts[index];
        const actual = pathParts[index];
        if (expected.startsWith(":")) {
            try {
                params[expected.slice(1)] = decodeURIComponent(actual);
            } catch {
                const error = new Error(`Failed to decode param '${actual}'`);
                error.status = 400;
                throw error;
            }
        } else if (expected.toLowerCase() !== actual.toLowerCase()) {
            return null;
        }
    }
    return params;
}

// The client address. Next.js puts the socket address in X-Forwarded-For when
// the request has none, and a proxy (such as Vercel's) sets or extends it, so
// the header holds [client, ...proxies, closest]. TRUST_PROXY_HOPS proxies at
// the end are trusted: with 0 or 1 the closest address is used, with 2 the one
// before it, and so on.
export function clientIp(headers, trustProxyHops = 0) {
    const chain = String(headers.get("x-forwarded-for") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    if (chain.length === 0) return headers.get("x-real-ip") ?? "127.0.0.1";
    const fromEnd = Math.max(trustProxyHops, 1);
    return chain[Math.max(chain.length - fromEnd, 0)];
}

export function createRequest(request, { pattern, params, trustProxyHops = 0 }) {
    const url = new URL(request.url);
    const headers = Object.create(null);
    request.headers.forEach((value, name) => {
        headers[name] = value;
    });

    return {
        method: request.method,
        url: `${url.pathname}${url.search}`,
        originalUrl: `${url.pathname}${url.search}`,
        path: url.pathname,
        baseUrl: "",
        route: { path: pattern },
        protocol: url.protocol.replace(/:$/, ""),
        hostname: url.hostname,
        headers,
        params,
        query: querystring.parse(url.search.replace(/^\?/, "")),
        body: undefined,
        ip: clientIp(request.headers, trustProxyHops),
        get(name) {
            const key = String(name).toLowerCase();
            if (key === "referer" || key === "referrer") return headers.referer ?? headers.referrer;
            return headers[key];
        },
        header(name) {
            return this.get(name);
        },
    };
}

// The Web Request a req was made from, for middleware that reads the body
// itself (see middleware/formBody.middleware.js).
const webRequests = new WeakMap();

export function attachWebRequest(req, request) {
    webRequests.set(req, request);
    return req;
}

export function webRequestOf(req) {
    return webRequests.get(req) ?? null;
}

const JSON_TYPE = /^application\/([\w!#$%&*.^`|~-]+\+)?json(\s*;|$)/i;
const STRICT_JSON_START = /^[\x20\x09\x0a\x0d]*([[{])/;

function httpError(status, message, type) {
    const error = new Error(message);
    error.status = status;
    error.type = type;
    return error;
}

// Like express.json(): parses JSON bodies up to the limit and leaves req.body
// undefined for other content types; an empty JSON body becomes {}. Only
// objects and arrays are accepted at the top level.
export async function readJsonBody(request, req, { limitBytes = 1024 * 1024 } = {}) {
    if (request.method === "GET" || request.method === "HEAD") return;
    const contentType = request.headers.get("content-type") ?? "";
    if (!JSON_TYPE.test(contentType)) return;
    if (!request.body) {
        req.body = {};
        return;
    }

    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > limitBytes) {
        throw httpError(413, "request entity too large", "entity.too.large");
    }

    const buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.length > limitBytes) throw httpError(413, "request entity too large", "entity.too.large");
    if (buffer.length === 0) {
        req.body = {};
        return;
    }

    const text = buffer.toString("utf8");
    if (!STRICT_JSON_START.test(text)) {
        throw httpError(400, "Unexpected token in JSON: only objects and arrays are accepted.", "entity.parse.failed");
    }
    try {
        req.body = JSON.parse(text);
    } catch (error) {
        throw httpError(400, error.message, "entity.parse.failed");
    }
}
