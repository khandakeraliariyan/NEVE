// Top navigation for public pages.
export const PUBLIC_NAV = [
    { to: "/properties", label: "Find Homes", end: true },
    { to: "/compare", label: "Compare" },
];

// Sidebar groups per role in the signed-in workspace.
const RENTER_NAV = [
    {
        title: "Overview",
        items: [{ to: "/renter", label: "Dashboard" }],
    },
    {
        title: "Discovery & saved",
        items: [
            { to: "/saved", label: "My favorites" },
            { to: "/recommendations", label: "Smart recommendations" },
        ],
    },
    {
        title: "Communications",
        items: [{ to: "/viewings", label: "Viewing requests" }],
    },
];
const LANDLORD_NAV = [
    {
        title: "Portfolio & assets",
        items: [
            { to: "/dashboard", label: "Dashboard" },
            { to: "/listings", label: "My properties", end: true },
            { to: "/listings/new", label: "Create property" },
        ],
    },
    {
        title: "Tenants & engagement",
        items: [{ to: "/listings/viewings", label: "Viewing management" }],
    },
];
const TENANCY_NAV = [
    {
        title: "Tenancy",
        items: [{ to: "/agreements", label: "Tenancy dashboard", end: true }],
    },
];
const REVIEWER_NAV = [
    {
        title: "Active review",
        items: [{ to: "/cases", label: "Case queue", end: true }],
    },
];
const ADMIN_NAV = [
    {
        title: "System governance",
        items: [
            { to: "/admin", label: "Platform health", end: true },
            { to: "/admin/audit-logs", label: "Audit trail" },
            { to: "/admin/ai-evaluations", label: "AI evaluations" },
        ],
    },
];

export function workspaceNav(role) {
    switch (role) {
        case "renter":
            return [...RENTER_NAV, ...TENANCY_NAV];
        case "landlord":
            return [...LANDLORD_NAV, ...TENANCY_NAV];
        case "mediator":
        case "legal_reviewer":
            return [...TENANCY_NAV, ...REVIEWER_NAV];
        case "admin":
            return ADMIN_NAV;
        default:
            return [];
    }
}

export const ROLE_LABELS = {
    renter: "Renter workspace",
    landlord: "Landlord workspace",
    mediator: "Mediator",
    legal_reviewer: "Legal reviewer",
    admin: "Admin console",
};
