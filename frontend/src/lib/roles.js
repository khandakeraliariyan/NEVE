// Which roles can open each part of the signed-in workspace.
export const ROLES = {
    RENTER: ["renter"],
    LANDLORD: ["landlord"],
    INQUIRY: ["renter", "landlord"],
    TENANCY: ["renter", "landlord", "mediator", "legal_reviewer"],
    REVIEWER: ["mediator", "legal_reviewer"],
    ADMIN: ["admin"],
};
