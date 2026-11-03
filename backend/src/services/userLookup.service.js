const LOOKUP_ROLES = {
    reviewer: ["mediator", "legal_reviewer"],
};

export function buildUserLookupFilter({ type, q, requesterId }) {
    const roles =
        typeof type === "string" && Object.hasOwn(LOOKUP_ROLES, type)
            ? LOOKUP_ROLES[type]
            : null;
    if (!roles) {
        return { error: "type must be reviewer." };
    }
    if (typeof q !== "string" || q.trim().length < 2 || q.trim().length > 100) {
        return { error: "q must be a text search of 2 to 100 characters." };
    }

    const value = q.trim();
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
        filter: {
            _id: { $ne: requesterId },
            role: { $in: roles },
            isActive: true,
            $or: [
                { displayName: new RegExp(escaped, "i") },
                { email: value.toLowerCase() },
            ],
        },
    };
}
