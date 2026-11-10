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
            { to: "/saved-searches", label: "Saved searches" },
        ],
    },
    {
        title: "Communications",
        items: [
            { to: "/inquiries", label: "Inquiries" },
            { to: "/viewings", label: "Viewing requests" },
        ],
    },
];
const LANDLORD_NAV = [
    {
        title: "Portfolio & assets",
        items: [
            { to: "/dashboard", label: "Dashboard" },
            { to: "/listings", label: "My properties", end: true },
            { to: "/listings/new", label: "Create property" },
            { to: "/listings/warnings", label: "Listing warnings" },
        ],
    },
    {
        title: "Tenants & engagement",
        items: [
            { to: "/inquiries", label: "Inquiries" },
            { to: "/listings/viewings", label: "Viewing management" },
        ],
    },
];
const TENANCY_NAV = [
    {
        title: "Tenancy",
        items: [
            { to: "/agreements", label: "Tenancy dashboard", end: true },
            { to: "/copilot", label: "Legal Copilot" },
        ],
    },
];
// Renters and landlords also see tenancy invitations.
const PARTY_TENANCY_NAV = (invitationsLabel) => [
    {
        title: "Tenancy",
        items: [
            { to: "/agreements", label: "Tenancy dashboard", end: true },
            { to: "/compliance", label: "Obligations & deadlines" },
            { to: "/invitations", label: invitationsLabel },
            { to: "/copilot", label: "Legal Copilot" },
        ],
    },
];
const REVIEWER_NAV = [
    {
        title: "Active review",
        items: [
            { to: "/cases", label: "Case queue", end: true },
            { to: "/legal-review", label: "Legal sources" },
        ],
    },
];
const ADMIN_NAV = [
    {
        title: "Trust & safety",
        items: [
            { to: "/admin/moderation", label: "Moderation" },
            { to: "/admin/verifications", label: "Verification queue" },
        ],
    },
    {
        title: "People & content",
        items: [
            { to: "/admin/users", label: "Users" },
            { to: "/admin/reviewers", label: "Legal reviewers" },
            { to: "/admin/legal-sources", label: "Legal sources" },
        ],
    },
    {
        title: "System governance",
        items: [
            { to: "/admin", label: "Platform health", end: true },
            { to: "/admin/audit-logs", label: "Audit trail" },
            { to: "/admin/data-retention", label: "Data retention" },
            { to: "/admin/system", label: "System jobs & delivery" },
            { to: "/admin/settings", label: "Platform settings" },
            { to: "/admin/ai-evaluations", label: "AI evaluations" },
        ],
    },
];

function accountNav(role) {
    const items = [{ to: "/notifications", label: "Notifications" }];
    if (["renter", "landlord", "legal_reviewer"].includes(role)) items.push({ to: "/verification", label: "Verification" });
    items.push({ to: "/settings", label: "Settings" });
    return [{ title: "Account", items }];
}

export function workspaceNav(role) {
    return [...roleNav(role), ...accountNav(role)];
}

function roleNav(role) {
    switch (role) {
        case "renter":
            return [...RENTER_NAV, ...PARTY_TENANCY_NAV("Invitations")];
        case "landlord":
            return [...LANDLORD_NAV, ...PARTY_TENANCY_NAV("Invite a renter")];
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
    legal_reviewer: "Legal reviewer",
    admin: "Admin console",
};
