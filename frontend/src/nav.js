// Top navigation for public pages.
export const PUBLIC_NAV = [
    { to: "/properties", label: "Find Homes", end: true },
    { to: "/compare", label: "Compare" },
];

// Sidebar groups per role in the signed-in workspace.
const RENTER_NAV = [];
const LANDLORD_NAV = [];
const TENANCY_NAV = [];
const REVIEWER_NAV = [];
const ADMIN_NAV = [];

export function workspaceNav(role) {
    switch (role) {
        case "renter":
            return [...RENTER_NAV, ...TENANCY_NAV];
        case "landlord":
        case "property_manager":
            return [...LANDLORD_NAV, ...TENANCY_NAV];
        case "mediator":
        case "legal_reviewer":
            return REVIEWER_NAV;
        case "admin":
            return ADMIN_NAV;
        default:
            return [];
    }
}

export const ROLE_LABELS = {
    renter: "Renter workspace",
    landlord: "Landlord workspace",
    property_manager: "Property manager",
    mediator: "Mediator",
    legal_reviewer: "Legal reviewer",
    admin: "Admin console",
};
