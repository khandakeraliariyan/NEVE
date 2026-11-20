// The response object controllers and middleware write to. It offers the
// small part of the Express response API the API uses (status, json, send,
// set, redirect, cookie, ...), records what was written, and turns it into a
// Web Response for the Next.js route handler.

const STATUS_WITHOUT_BODY = new Set([101, 204, 205, 304]);

function serializeCookie(name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    if (options.maxAge !== undefined) {
        const maxAgeMs = Number(options.maxAge);
        parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
        parts.push(`Expires=${new Date(Date.now() + maxAgeMs).toUTCString()}`);
    } else if (options.expires) {
        parts.push(`Expires=${new Date(options.expires).toUTCString()}`);
    }
    if (options.domain) parts.push(`Domain=${options.domain}`);
    parts.push(`Path=${options.path ?? "/"}`);
    if (options.httpOnly) parts.push("HttpOnly");
    if (options.secure) parts.push("Secure");
    if (options.sameSite) {
        const sameSite = options.sameSite === true ? "strict" : String(options.sameSite).toLowerCase();
        parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
    }
    return parts.join("; ");
}

export class ApiResponse {
    constructor() {
        this.statusCode = 200;
        this.headers = new Headers();
        this.cookies = [];
        this.body = null;
        this.finished = false;
        this.finishedPromise = new Promise((resolve) => {
            this.resolveFinished = resolve;
        });
    }

    get headersSent() {
        return this.finished;
    }

    status(code) {
        this.statusCode = code;
        return this;
    }

    set(field, value) {
        if (typeof field === "object" && field !== null) {
            for (const [name, item] of Object.entries(field)) this.set(name, item);
            return this;
        }
        this.headers.set(field, Array.isArray(value) ? value.join(", ") : String(value));
        return this;
    }

    header(field, value) {
        return this.set(field, value);
    }

    setHeader(field, value) {
        return this.set(field, value);
    }

    get(field) {
        return this.headers.get(field) ?? undefined;
    }

    getHeader(field) {
        return this.get(field);
    }

    type(contentType) {
        return this.set("Content-Type", contentType);
    }

    json(value) {
        if (!this.headers.has("Content-Type")) this.set("Content-Type", "application/json; charset=utf-8");
        return this.end(value === undefined ? "" : JSON.stringify(value));
    }

    send(body) {
        if (body === null || body === undefined) return this.end("");
        if (typeof body === "string") {
            if (!this.headers.has("Content-Type")) this.set("Content-Type", "text/html; charset=utf-8");
            return this.end(body);
        }
        if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
            if (!this.headers.has("Content-Type")) this.set("Content-Type", "application/octet-stream");
            return this.end(body);
        }
        return this.json(body);
    }

    sendStatus(code) {
        this.status(code);
        if (!this.headers.has("Content-Type")) this.set("Content-Type", "text/plain; charset=utf-8");
        return this.end(String(code));
    }

    redirect(statusOrUrl, maybeUrl) {
        const [status, url] = typeof statusOrUrl === "number" ? [statusOrUrl, maybeUrl] : [302, statusOrUrl];
        this.status(status);
        this.set("Location", url);
        if (!this.headers.has("Content-Type")) this.set("Content-Type", "text/plain; charset=utf-8");
        return this.end(`Redirecting to ${url}`);
    }

    cookie(name, value, options = {}) {
        this.cookies.push(serializeCookie(name, value, options));
        return this;
    }

    clearCookie(name, options = {}) {
        // Like Express, an expiry in the past (maxAge is ignored).
        const { maxAge: _maxAge, ...rest } = options;
        return this.cookie(name, "", { ...rest, expires: new Date(1) });
    }

    end(chunk) {
        if (this.finished) return this;
        this.body = chunk ?? null;
        this.finished = true;
        this.resolveFinished();
        return this;
    }

    toResponse({ omitBody = false } = {}) {
        const headers = new Headers(this.headers);
        for (const cookie of this.cookies) headers.append("Set-Cookie", cookie);
        const withoutBody = omitBody || STATUS_WITHOUT_BODY.has(this.statusCode) || this.body === null || this.body === "";
        return new Response(withoutBody ? null : this.body, { status: this.statusCode, headers });
    }
}
