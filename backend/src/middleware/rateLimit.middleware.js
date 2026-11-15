import rateLimit from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

// A full listing holds 30 media files, and each file takes two upload requests.
// This leaves room for retries and for opening private files.
export const UPLOAD_RATE_LIMIT = 120;

const createLimiter = (limit, options = {}) =>
    rateLimit({
        windowMs: WINDOW_MS,
        limit,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            message: "Too many requests. Please try again later.",
        },
        ...options,
    });

const isUploadRequest = (req) =>
    req.path === "/uploads" || req.path.startsWith("/uploads/");

// Mounted on /api/v1. Uploads have their own limiter, so they don't also use
// up the budget for the rest of the API.
export const apiLimiter = createLimiter(100, { skip: isUploadRequest });

export const authLimiter = createLimiter(20);
export const userLimiter = createLimiter(20);
export const uploadLimiter = createLimiter(UPLOAD_RATE_LIMIT);

// Each extraction is a paid model call on a whole document.
export const extractionLimiter = createLimiter(10);
// Legal Copilot questions are model calls too, but a conversation needs more.
export const copilotLimiter = createLimiter(40);
// Each AI ranking is a paid model call over a whole shortlist.
export const aiRankingLimiter = createLimiter(10);
