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
    OVERPASS_API_URL: z
        .string()
        .url()
        .default("https://overpass-api.de/api/interpreter"),
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
    // Email delivery through an HTTP email API. All three are needed.
    EMAIL_PROVIDER: z.enum(["resend", "sendgrid"]).optional(),
    EMAIL_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().optional(),
    // Push delivery through Firebase Cloud Messaging.
    PUSH_NOTIFICATIONS_ENABLED: z
        .enum(["true", "false"])
        .default("false")
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

const parsed = envSchema.safeParse(process.env);

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
