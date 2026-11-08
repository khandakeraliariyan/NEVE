// Every notification type, and how each one may be delivered.

export const NOTIFICATION_TYPES = [
    // Viewings
    "viewing_request_received",
    "viewing_request_confirmed",
    "viewing_request_declined",
    "viewing_request_approved",
    "viewing_request_rejected",
    "viewing_request_cancelled",
    "viewing_reminder",
    // Inquiries
    "inquiry_received",
    "inquiry_sent",
    "inquiry_responded",
    "inquiry_reminder",
    "inquiry_message_received",
    // Discovery
    "matching_listing_available",
    "favorite_property_changed",
    // Tenancy
    "tenancy_case_shared",
    "tenancy_case_review_activity",
    "maintenance_request_submitted",
    "maintenance_request_updated",
    "condition_entry_reviewed",
    "evidence_link_proposed",
    "evidence_link_reviewed",
    "agreement_analysis_complete",
    "lease_ending",
    "obligation_due",
    // Trust, legal and account
    "listing_flagged",
    "legal_source_submitted",
    "staff_role_changed",
    "account_status_changed",
    "verification_reviewed",
    "security_new_device",
    "security_password_changed",
];

// Security alerts can't be muted, turned off or held for the digest.
export const SECURITY_TYPES = new Set(["security_new_device", "security_password_changed"]);

// Time-sensitive types are always emailed straight away, even for digest users.
export const DIGEST_EXEMPT_TYPES = new Set([
    ...SECURITY_TYPES,
    "inquiry_received",
    "inquiry_reminder",
    "viewing_reminder",
    "viewing_request_cancelled",
    "verification_reviewed",
    "account_status_changed",
]);

// SMS is only used for viewing reminders and security alerts (spec 3.18).
export const SMS_TYPES = new Set(["viewing_reminder", ...SECURITY_TYPES]);
