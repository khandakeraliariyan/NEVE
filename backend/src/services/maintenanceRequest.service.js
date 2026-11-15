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
                { location: search },
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

const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{5,19}$/;

// A repair can be assigned to one of the agreement's participants, or to a
// named person outside Neve (a plumber, electrician or caretaker). null clears
// the assignment.
export function validateMaintenanceAssignee(body, agreement) {
    const assignee = body?.assignee;
    if (assignee === null) {
        return { value: null };
    }
    if (!assignee || typeof assignee !== "object" || Array.isArray(assignee)) {
        return { error: "assignee must be an object or null." };
    }

    const { userId, name, phone, organization } = assignee;
    if (userId !== undefined) {
        const participants = [agreement?.renter, agreement?.landlord]
            .filter(Boolean)
            .map((id) => String(id?._id ?? id));
        if (!participants.includes(String(userId))) {
            return { error: "assignee.userId must be the renter or landlord on this agreement." };
        }
        if (name !== undefined || phone !== undefined || organization !== undefined) {
            return { error: "Give either assignee.userId or a named person, not both." };
        }
        return { value: { user: String(userId), name: "", phone: null, organization: "" } };
    }

    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
        return { error: "assignee.name is required and must be at most 100 characters." };
    }
    if (
        phone !== undefined &&
        phone !== null &&
        (typeof phone !== "string" || !PHONE_PATTERN.test(phone.trim()))
    ) {
        return { error: "assignee.phone must be a valid phone number." };
    }
    if (organization !== undefined && (typeof organization !== "string" || organization.length > 100)) {
        return { error: "assignee.organization must be at most 100 characters." };
    }
    return {
        value: {
            user: null,
            name: name.trim(),
            phone: typeof phone === "string" ? phone.trim() : null,
            organization: typeof organization === "string" ? organization.trim() : "",
        },
    };
}
