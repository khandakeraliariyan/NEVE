import { createChainedLogEntry } from "./logChain.service.js";
import SensitiveAccessLog from "../models/SensitiveAccessLog.js";

export async function recordSensitiveAccess({
    actor,
    action,
    resourceType,
    resourceId,
    agreement = null,
    outcome = "allowed",
    details = {},
    ipAddress = null,
}) {
    if (!actor) {
        throw new Error("Sensitive access event requires an authenticated actor.");
    }

    return createChainedLogEntry(SensitiveAccessLog, {
        actor,
        action,
        resourceType,
        resourceId,
        agreement,
        outcome,
        details,
        ipAddress,
    });
}
