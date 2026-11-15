// Admins appoint legal reviewers from existing renter accounts and can take
// the role away again, and can switch an account between renter and landlord.
// Admin accounts are only created through "Add staff".
export const ROLE_CHANGES = {
    grant_reviewer: { from: "renter", to: "legal_reviewer" },
    revoke_reviewer: { from: "legal_reviewer", to: "renter" },
    make_landlord: { from: "renter", to: "landlord" },
    make_renter: { from: "landlord", to: "renter" },
};

const WRONG_ROLE = {
    grant_reviewer: "Only renter accounts can be made legal reviewers.",
    revoke_reviewer: "This user isn't a legal reviewer.",
    make_landlord: "Only renter accounts can be made landlords.",
    make_renter: "This user isn't a landlord.",
};

export function validateRoleChange({ action, target, actorId, isAgreementParty, hasListings }) {
    const change = Object.hasOwn(ROLE_CHANGES, action) ? ROLE_CHANGES[action] : null;
    if (!change) {
        return { error: `action must be one of ${Object.keys(ROLE_CHANGES).join(", ")}.`, status: 400 };
    }
    if (!target) {
        return { error: "User not found.", status: 404 };
    }
    if (String(target._id) === String(actorId)) {
        return { error: "You can't change your own role.", status: 403 };
    }
    if (target.role !== change.from) {
        return { error: WRONG_ROLE[action], status: 409 };
    }
    if (["make_landlord", "make_renter"].includes(action)) {
        if (!target.isActive) {
            return { error: "Inactive accounts can't change role.", status: 409 };
        }
        // Their records are tied to the side they are on.
        if (isAgreementParty) {
            return {
                error: "This user is a party to a tenancy agreement, so their role can't be switched.",
                status: 409,
            };
        }
        if (action === "make_renter" && hasListings) {
            return {
                error: "This landlord still has listings. They must delete them before becoming a renter.",
                status: 409,
            };
        }
        return { value: change };
    }
    if (action === "grant_reviewer" && !target.isActive) {
        return { error: "Inactive accounts can't be made legal reviewers.", status: 409 };
    }
    // A reviewer must be neutral, and a party would also lose renter features.
    if (action === "grant_reviewer" && isAgreementParty) {
        return {
            error: "This user is a party to a tenancy agreement, so they can't be a neutral reviewer.",
            status: 409,
        };
    }
    return { value: change };
}

export const validateReviewerRoleChange = validateRoleChange;

const LISTABLE_ROLES = ["renter", "landlord", "legal_reviewer", "admin"];

export function buildAdminUserFilter({ q, role }) {
    const filter = {};
    if (role !== undefined && role !== "") {
        if (!LISTABLE_ROLES.includes(role)) {
            return { error: "Invalid role filter." };
        }
        filter.role = role;
    }
    if (q !== undefined && q !== "") {
        if (typeof q !== "string" || q.trim().length < 2 || q.trim().length > 100) {
            return { error: "q must be a text search of 2 to 100 characters." };
        }
        const value = q.trim();
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = [
            { displayName: new RegExp(escaped, "i") },
            { email: value.toLowerCase() },
        ];
    }
    return { filter };
}

// Admins can deactivate and reactivate renter, landlord and legal reviewer
// accounts. Admin accounts and the admin's own account are never changed here.
export function validateAccountStatusChange({ isActive, reason, target, actorId }) {
    if (typeof isActive !== "boolean") {
        return { error: "isActive must be true or false.", status: 400 };
    }
    if (reason !== undefined && reason !== null && (typeof reason !== "string" || reason.length > 500)) {
        return { error: "reason must be text of at most 500 characters.", status: 400 };
    }
    if (!target) {
        return { error: "User not found.", status: 404 };
    }
    if (String(target._id) === String(actorId)) {
        return { error: "You can't change your own account status.", status: 403 };
    }
    if (target.role === "admin") {
        return { error: "Admin accounts can't be deactivated here.", status: 403 };
    }
    if (target.isActive === isActive) {
        return {
            error: isActive ? "This account is already active." : "This account is already inactive.",
            status: 409,
        };
    }
    return { value: { isActive, reason: typeof reason === "string" ? reason.trim() : "" } };
}
