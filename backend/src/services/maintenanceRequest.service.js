const STATUS_TRANSITIONS = {
    submitted: ["acknowledged", "in_progress", "disputed", "cancelled"],
    acknowledged: [
        "in_progress",
        "awaiting_renter",
        "completed",
        "disputed",
        "cancelled",
    ],
    in_progress: ["awaiting_renter", "completed", "disputed", "cancelled"],
    awaiting_renter: ["in_progress", "completed", "disputed", "cancelled"],
    completed: ["in_progress", "disputed"],
    disputed: ["in_progress", "completed", "cancelled"],
    cancelled: [],
};

export function buildMaintenanceSearchFilter(query) {
    if (query === undefined) {
        return { filter: {} };
    }
    if (typeof query !== "string" || query.trim().length > 120) {
        return {
            error: "q must be a text search of at most 120 characters.",
        };
    }
    const value = query.trim();
    if (!value) {
        return { filter: {} };
    }
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const search = new RegExp(escaped, "i");
    return {
        filter: {
            $or: [
                { title: search },
                { description: search },
                { category: search },
                { "history.message": search },
            ],
        },
    };
}

export function canTransitionMaintenanceStatus(currentStatus, nextStatus) {
    return (
        currentStatus === nextStatus ||
        STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus) === true
    );
}
