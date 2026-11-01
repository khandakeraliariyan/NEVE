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

export function canTransitionMaintenanceStatus(currentStatus, nextStatus) {
    return (
        currentStatus === nextStatus ||
        STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus) === true
    );
}
