// /api/v1/health
import { Router } from "../../../../../server/http/router.js";
import { apiRoutes } from "../../../../../server/http/route.js";
import { connectDatabase } from "../../../../../server/config/database.js";
import { getFirebaseAuth } from "../../../../../server/config/firebase.js";
import { isR2Configured } from "../../../../../server/config/r2.js";
import { env } from "../../../../../server/config/env.js";
import { diagnoseDatabaseError, diagnoseFirebaseError } from "../../../../../server/services/deployDiagnostics.service.js";

const router = Router();
router.get("/", (req, res) => res.status(200).json({ success: true, message: "Neve API is running" }));

// Checks each service a deployment depends on and says what is wrong, never showing a secret.
router.get("/status", async (req, res) => {
    const checks = {};
    try {
        await connectDatabase();
        checks.database = { ok: true };
    } catch (error) {
        checks.database = { ok: false, ...diagnoseDatabaseError(error) };
    }
    try {
        getFirebaseAuth();
        checks.firebase = { ok: true };
    } catch (error) {
        checks.firebase = { ok: false, ...diagnoseFirebaseError(error) };
    }
    checks.storage = { ok: isR2Configured, ...(isR2Configured ? {} : { hint: "Set the four R2_* variables to enable uploads." }) };
    const aiKey = env.AI_PROVIDER === "anthropic" ? env.ANTHROPIC_API_KEY : env.GROQ_API_KEY;
    checks.ai = { ok: Boolean(aiKey), provider: env.AI_PROVIDER, ...(aiKey ? {} : { hint: "AI features are off until the provider's API key is set." }) };
    checks.appUrl = { ok: Boolean(env.CLIENT_URL && env.API_PUBLIC_URL), clientUrl: env.CLIENT_URL ?? null };
    const required = checks.database.ok && checks.firebase.ok;
    return res.status(required ? 200 : 503).json({ success: required, checks });
});

const handler = apiRoutes([{ prefix: "/api/v1/health", router }]);

export const dynamic = "force-dynamic";
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
