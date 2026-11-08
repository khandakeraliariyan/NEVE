// Which roles can open each part of the signed-in workspace.
export const ROLES = {
    RENTER: ["renter"],
    LANDLORD: ["landlord"],
    INQUIRY: ["renter", "landlord"],
    TENANCY: ["renter", "landlord", "legal_reviewer"],
    REVIEWER: ["legal_reviewer"],
    ADMIN: ["admin"],
    VERIFICATION: ["renter", "landlord"],
    ANY: ["renter", "landlord", "legal_reviewer", "admin"],
};
