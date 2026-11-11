// Catalogue of every notification Neve sends. Delivery rules (security,
// digest) are decided here so controllers only say what happened.

export const NOTIFICATION_TYPES = [
    // Connect: inquiries and messages
    "inquiry_received",
    "inquiry_sent",
    "inquiry_replied",
    "inquiry_reminder",
    "inquiry_message_received",
    // Viewings
    "viewing_request_received",
    "viewing_request_confirmed",
    "viewing_request_declined",
    "viewing_request_approved",
    "viewing_request_rejected",
    "viewing_request_rescheduled",
    "viewing_request_cancelled",
    "viewing_reminder",
    // Discovery
    "matching_listing_available",
    "favorite_property_changed",
    // Tenancy
    "maintenance_request_submitted",
    "maintenance_request_updated",
    "condition_entry_reviewed",
    "evidence_link_proposed",
    "evidence_link_disputed",
    "agreement_analysis_complete",
    "lease_ending",
    "obligation_due",
    "obligation_overdue",
    "tenancy_case_shared",
    "tenancy_document_added",
    "tenancy_case_review_activity",
    "tenancy_invitation_received",
    "tenancy_invitation_accepted",
    "tenancy_invitation_declined",
    // Trust, legal and account
    "listing_flagged",
    "listing_appeal_submitted",
    "listing_appeal_decided",
    "legal_source_submitted",
    "legal_source_flagged",
    "copilot_answer_reported",
    "legal_source_decided",
    "legal_source_assigned",
    "legal_source_published",
    "citation_review_requested",
    "ai_evaluation_recorded",
    "verification_reviewed",
    "staff_role_changed",
    "account_status_changed",
    "account_appeal_submitted",
    "account_appeal_decided",
    // Security (always sent by email; can't be muted)
    "security_new_device",
    "security_password_changed",
];

// Security notices ignore email preferences and never carry an unsubscribe link.
export const SECURITY_TYPES = new Set(["security_new_device", "security_password_changed"]);

// Non-urgent events that users on the daily digest get in one email instead
// of one email each. Everything else is still emailed straight away.
export const DIGEST_TYPES = new Set([
    "matching_listing_available",
    "favorite_property_changed",
    "maintenance_request_updated",
    "condition_entry_reviewed",
    "evidence_link_proposed",
    "evidence_link_disputed",
    "agreement_analysis_complete",
    "lease_ending",
    "obligation_due",
    "tenancy_case_shared",
    "tenancy_document_added",
    "tenancy_case_review_activity",
    "legal_source_submitted",
    "legal_source_published",
    "ai_evaluation_recorded",
]);

export function isSecurityType(type) {
    return SECURITY_TYPES.has(type);
}

// Where "Open Neve" goes when the notification doesn't carry its own link.
export function defaultNotificationLink(notification) {
    const property = notification.relatedProperty?._id ?? notification.relatedProperty;
    const agreement = notification.relatedAgreement?._id ?? notification.relatedAgreement;
    switch (notification.type) {
        case "inquiry_received":
        case "inquiry_sent":
        case "inquiry_replied":
        case "inquiry_reminder":
        case "inquiry_message_received":
            return "/inquiries";
        case "matching_listing_available":
        case "favorite_property_changed":
            return property ? `/properties/${property}` : "/saved";
        case "agreement_analysis_complete":
            return agreement ? `/agreements/${agreement}/clauses` : "/agreements";
        case "maintenance_request_submitted":
        case "maintenance_request_updated":
            return agreement ? `/agreements/${agreement}/maintenance` : "/agreements";
        case "tenancy_document_added":
            return agreement ? `/agreements/${agreement}/documents` : "/agreements";
        case "condition_entry_reviewed":
            return agreement ? `/agreements/${agreement}/condition` : "/agreements";
        case "evidence_link_proposed":
        case "evidence_link_disputed":
            return agreement ? `/agreements/${agreement}/evidence` : "/agreements";
        case "lease_ending":
        case "obligation_due":
        case "obligation_overdue":
            return agreement ? `/agreements/${agreement}` : "/agreements";
        case "legal_source_submitted":
        case "legal_source_flagged":
        case "legal_source_decided":
        case "legal_source_assigned":
        case "legal_source_published":
            return "/legal-review";
        case "citation_review_requested":
            return "/legal-review/ai-oversight";
        case "ai_evaluation_recorded":
            return "/legal-review/ai-evaluations";
        case "copilot_answer_reported":
            return "/legal-review/ai-oversight";
        case "verification_reviewed":
            return "/verification";
        case "account_appeal_submitted":
            return "/admin/users";
        case "account_appeal_decided":
            return "/settings";
        case "security_new_device":
        case "security_password_changed":
            return "/settings";
        default:
            return "/notifications";
    }
}
