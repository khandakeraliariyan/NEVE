import { isIP } from "node:net";

const WINDOW_MS = 15 * 60 * 1000;

// A full listing holds 30 media files, and each file takes two upload requests.
// This leaves room for retries and for opening private files.
export const UPLOAD_RATE_LIMIT = 120;

const MESSAGE = { message: "Too many requests. Please try again later." };

// Counters live in this process (one serverless instance or one server), as
// they did with express-rate-limit's memory store. They are kept on
// globalThis so every route bundle in the process shares one budget.
const stores = (globalThis.__neveRateLimitStores ??= new Map());

// IPv6 clients usually control a whole /56, so they share one counter.
function clientKey(ip) {
    if (isIP(ip) !== 6) return ip ?? "unknown";
    const [head] = ip.split("%");
    const expanded = head.includes("::")
        ? (() => {
              const [left, right] = head.split("::");
              const leftParts = left ? left.split(":") : [];
              const rightParts = right ? right.split(":") : [];
              return [...leftParts, ...Array(8 - leftParts.length - rightParts.length).fill("0"), ...rightParts];
          })()
        : head.split(":");
    const first56 = expanded.slice(0, 4).map((part) => part.padStart(4, "0"));
    first56[3] = `${first56[3].slice(0, 2)}00`;
    return `${first56.join(":")}::/56`;
}

function prune(store, now) {
    if (store.size < 10000) return;
    for (const [key, entry] of store) {
        if (entry.resetAt <= now) store.delete(key);
    }
}

export function createLimiter(name, limit, { windowMs = WINDOW_MS, skip = () => false } = {}) {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);

    const limiter = (req, res, next) => {
        if (skip(req)) return next();
        const now = Date.now();
        const key = clientKey(req.ip);
        let entry = store.get(key);
        if (!entry || entry.resetAt <= now) {
            prune(store, now);
            entry = { hits: 0, resetAt: now + windowMs };
            store.set(key, entry);
        }
        entry.hits += 1;

        const resetSeconds = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
        res.set("RateLimit-Policy", `${limit};w=${Math.round(windowMs / 1000)}`);
        res.set("RateLimit-Limit", String(limit));
        res.set("RateLimit-Remaining", String(Math.max(0, limit - entry.hits)));
        res.set("RateLimit-Reset", String(resetSeconds));

        if (entry.hits > limit) {
            res.set("Retry-After", String(resetSeconds));
            return res.status(429).json(MESSAGE);
        }
        return next();
    };
    limiter.reset = () => store.clear();
    return limiter;
}

const isUploadRequest = (req) => req.path === "/api/v1/uploads" || req.path.startsWith("/api/v1/uploads/");

// Applied to every API request. Uploads have their own limiter, so they don't
// also use up the budget for the rest of the API.
export const apiLimiter = createLimiter("api", 100, { skip: isUploadRequest });

export const authLimiter = createLimiter("auth", 20);
export const userLimiter = createLimiter("user", 20);
export const uploadLimiter = createLimiter("upload", UPLOAD_RATE_LIMIT);

// Each extraction is a paid model call on a whole document.
export const extractionLimiter = createLimiter("extraction", 10);
// Legal Copilot questions are model calls too, but a conversation needs more.
export const copilotLimiter = createLimiter("copilot", 40);
// Each AI ranking is a paid model call over a whole shortlist.
export const aiRankingLimiter = createLimiter("aiRanking", 10);
