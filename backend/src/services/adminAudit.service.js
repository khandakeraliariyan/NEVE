
import AdminAuditLog from "../models/AdminAuditLog.js";

export const recordAdminAction = async ({
    req,
    action,
    targetType,
    targetId,
    details = {},
}) => {
    const actorId = req.neveUser?._id ?? req.user?._id ?? req.user?.id;

    if (!actorId) {
        throw new Error("Authenticated admin ID is missing.");
    }

    return AdminAuditLog.create({
        actor: actorId,
        action,
        targetType,
        targetId,
        details,
        ipAddress: req.ip ?? null,
    });
};
