import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    CLIENT_URL: z.string().url(),
    MONGODB_URI: z.string().min(1),
    FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1),
    // Signs admin session JWTs. Use a long random value, e.g.
    // node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
    ADMIN_JWT_SECRET: z.string().min(32, "ADMIN_JWT_SECRET must be at least 32 characters"),
    ADMIN_JWT_EXPIRES_IN: z.string().min(1).default("8h"),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_REGION: z.string().default("auto"),
    UPLOAD_URL_TTL_SECONDS: z.coerce
        .number()
        .int()
        .min(60)
        .max(3600)
        .default(300),
    MAX_PROPERTY_IMAGE_SIZE_MB: z.coerce
        .number()
        .positive()
        .default(5),
    MAX_TENANCY_EVIDENCE_SIZE_MB: z.coerce
        .number()
        .positive()
        .default(15),
    MAX_PROPERTY_VIDEO_SIZE_MB: z.coerce
        .number()
        .positive()
        .default(50),
    MAX_FLOOR_PLAN_SIZE_MB: z.coerce
        .number()
        .positive()
        .default(10),
    // One Overpass server, or several separated by commas: each is tried in
    // turn when the one before it fails or is too slow.
    OVERPASS_API_URL: z
        .string()
        .default("https://overpass-api.de/api/interpreter")
        .refine(
            (value) =>
                value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .every((item) => URL.canParse(item)),
            "OVERPASS_API_URL must be one URL or a comma-separated list of URLs."
        ),
    OVERPASS_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(120).default(25),
    // OSRM-compatible routing services for walking and driving times.
    ROUTING_WALKING_URL: z
        .string()
        .url()
        .default("https://routing.openstreetmap.de/routed-foot"),
    ROUTING_DRIVING_URL: z
        .string()
        .url()
        .default("https://routing.openstreetmap.de/routed-car"),
    // The Anthropic SDK reads ANTHROPIC_API_KEY itself; it is listed here so a
    // missing key can be reported as "extraction not configured".
    ANTHROPIC_API_KEY: z.string().optional(),
    AGREEMENT_EXTRACTION_MODEL: z.string().min(1).default("claude-opus-5-5"),
    // Model for the AI ranking of a renter's recommendation shortlist.
    RECOMMENDATION_MODEL: z.string().min(1).default("claude-opus-5-5"),
    // Email delivery through an HTTP email API. All three are needed.
    EMAIL_PROVIDER: z.enum(["resend", "sendgrid"]).optional(),
    EMAIL_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().optional(),
    // Public address of this API, used for unsubscribe links and listing
    // thumbnails in emails, e.g. https://api.neve.app
    API_PUBLIC_URL: z.string().url().optional(),
    // Signs unsubscribe links. Falls back to a key derived from ADMIN_JWT_SECRET.
    NOTIFICATION_LINK_SECRET: z.string().min(32).optional(),
    // Time zone used for dates in notifications and the digest hour.
    NOTIFICATION_TIME_ZONE: z.string().min(1).default("Asia/Dhaka"),
    // Local hour (0-23) when daily digest emails go out.
    NOTIFICATION_DIGEST_HOUR: z.coerce.number().int().min(0).max(23).default(8),
    // AES-256-GCM key for NID/passport numbers and dates of birth: 32 random
    // bytes, base64. node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    FIELD_ENCRYPTION_KEY: z.string().optional(),
    FIELD_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).default(1),
    // Earlier keys kept for reading old values after a rotation: "1:base64,2:base64".
    FIELD_ENCRYPTION_OLD_KEYS: z.string().optional(),
    // Days an account's photos and listing media are kept after the account
    // is deleted, before the retention purge removes them.
    ACCOUNT_DELETION_FILE_RETENTION_DAYS: z.coerce.number().int().min(0).max(3650).default(30),
    // Inquiry, viewing, obligation and lease reminders.
    NOTIFICATION_REMINDERS_ENABLED: z
        .enum(["true", "false"])
        .default("true")
        .transform((value) => value === "true"),
    // Background jobs. Both are off unless enabled.
    RETENTION_PURGE_ENABLED: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
    RETENTION_PURGE_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(10080).default(60),
    ABANDONED_UPLOAD_HOURS: z.coerce.number().int().min(1).max(720).default(24),
    VERIFICATION_DOCUMENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
    BACKUP_ENABLED: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
    BACKUP_INTERVAL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
    BACKUP_RETENTION_COUNT: z.coerce.number().int().min(1).max(365).default(14),
    BACKUP_BUCKET_NAME: z.string().optional(),
    NEVE_API_BASE_URL: z
        .string()
        .url()
        .default("http://localhost:5000/api/v1"),
});

// A blank line like "EMAIL_PROVIDER=" means "not set", not an empty value.
const definedEnv = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => typeof value !== "string" || value.trim() !== "")
);

const parsed = envSchema.safeParse(definedEnv);

if (!parsed.success) {
    console.error("Invalid environment configuration:");
    console.error(
        parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
        }))
    );

    throw new Error("Environment configuration is invalid.");
}

export const env = parsed.data;
