import express from "express";
import {
    addAgreementClause,
    addAgreementEvidenceLink,
    addAgreementObligation,
    addAgreementPayment,
    createTenancyAgreement,
    getAgreementEvidenceGraph,
    getAgreementIntegrity,
    getAgreementEvidenceReport,
    getTenancyAgreement,
    listTenancyAgreements,
    revokeAgreementShare,
    shareAgreement,
    updateAgreementObligation,
    updateAgreementEvidenceLink,
    confirmAgreementEvidenceLink,
    addAgreementLegalLink,
    suggestClauseRewrite,
    respondToClauseRewrite,
    assessClauseRewrite,
    suggestAgreementEvidenceLinks,
    reviewSuggestedEvidenceLink,
    addAgreementRecordLink,
    removeAgreementRecordLink,
    updateAgreementPayment,
    updateTenancyAgreementStatus,
    attachAgreementDocument,
} from "../controllers/tenancyAgreement.controller.js";
import {
    extractAgreement,
    reviewAgreementClause,
} from "../controllers/agreementExtraction.controller.js";
import {
    listClauseLegalSources,
    listLegalSuggestions,
    reviewLegalSuggestion,
    runLegalSuggestions,
} from "../controllers/legalSuggestion.controller.js";
import {
    acceptInvitation,
    cancelInvitation,
    createInvitation,
    declineInvitation,
    getInvitation,
    listInvitations,
} from "../controllers/tenancyInvitation.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { extractionLimiter } from "../middleware/rateLimit.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import {
    addConditionEntry,
    correctConditionEntry,
    createConditionReport,
    createMaintenanceRequest,
    getConditionComparison,
    listConditionReports,
    listMaintenanceRequests,
    reviewConditionEntry,
    updateMaintenanceRequest,
    assignMaintenanceRequest,
} from "../controllers/tenancyOperations.controller.js";
import {
    addCaseEvidence,
    createTenancyCase,
    getTenancyCase,
    listSharedTenancyCases,
    listTenancyCases,
    removeCaseEvidence,
    revokeTenancyCaseShare,
    shareTenancyCase,
    updateTenancyCaseStatus,
    addCaseReviewEntry,
} from "../controllers/tenancyCase.controller.js";

const router = express.Router();

router.use(
    authenticateUser,
    allowRoles(
        "renter",
        "landlord",
        "legal_reviewer"
    )
);

router.post("/agreements", allowRoles("renter", "landlord"), createTenancyAgreement);

// Landlord invites a renter by email; the renter accepts to start the record.
router.post("/invitations", allowRoles("landlord"), createInvitation);
router.get("/invitations", allowRoles("renter", "landlord"), listInvitations);
router.get("/invitations/:invitationId", allowRoles("renter", "landlord"), getInvitation);
router.post("/invitations/:invitationId/accept", allowRoles("renter", "landlord"), acceptInvitation);
router.post("/invitations/:invitationId/decline", allowRoles("renter", "landlord"), declineInvitation);
router.post("/invitations/:invitationId/cancel", allowRoles("landlord"), cancelInvitation);
router.patch("/agreements/:agreementId/document", allowRoles("renter", "landlord"), attachAgreementDocument);
router.get("/agreements", listTenancyAgreements);
router.get("/agreements/:agreementId/cases", listTenancyCases);
router.post(
    "/agreements/:agreementId/cases",
    allowRoles("renter", "landlord"),
    createTenancyCase
);
router.get(
    "/cases",
    allowRoles("legal_reviewer"),
    listSharedTenancyCases
);
router.get("/cases/:caseId", getTenancyCase);
router.post("/cases/:caseId/evidence", addCaseEvidence);
router.delete("/cases/:caseId/evidence/:fileId", removeCaseEvidence);
router.post(
    "/cases/:caseId/shares",
    allowRoles("renter", "landlord"),
    shareTenancyCase
);
router.delete(
    "/cases/:caseId/shares/:userId",
    allowRoles("renter", "landlord"),
    revokeTenancyCaseShare
);
// Reviewers and parties both post; the controller limits which kinds each may use.
router.post("/cases/:caseId/review-entries", addCaseReviewEntry);
router.patch(
    "/cases/:caseId/status",
    allowRoles("renter", "landlord"),
    updateTenancyCaseStatus
);
router.post(
    "/agreements/:agreementId/condition-reports/:stage",
    createConditionReport
);
router.post(
    "/agreements/:agreementId/condition-reports/:reportId/entries",
    addConditionEntry
);
router.post(
    "/agreements/:agreementId/condition-reports/:reportId/entries/:entryId/corrections",
    correctConditionEntry
);
router.post(
    "/agreements/:agreementId/condition-reports/:reportId/entries/:entryId/reviews",
    reviewConditionEntry
);
router.get(
    "/agreements/:agreementId/condition-comparison",
    getConditionComparison
);
router.get(
    "/agreements/:agreementId/condition-reports",
    listConditionReports
);
router.get("/maintenance-requests", listMaintenanceRequests);
router.post(
    "/agreements/:agreementId/maintenance-requests",
    createMaintenanceRequest
);
router.patch(
    "/maintenance-requests/:requestId/progress",
    updateMaintenanceRequest
);
router.patch(
    "/maintenance-requests/:requestId/assignee",
    allowRoles("landlord"),
    assignMaintenanceRequest
);
router.get("/agreements/:agreementId/evidence-graph", getAgreementEvidenceGraph);
router.get("/agreements/:agreementId/integrity", getAgreementIntegrity);
router.get(
    "/agreements/:agreementId/evidence-report",
    getAgreementEvidenceReport
);
router.post(
    "/agreements/:agreementId/evidence-links",
    allowRoles("renter", "landlord"),
    addAgreementEvidenceLink
);
router.patch(
    "/agreements/:agreementId/evidence-links/:linkId",
    updateAgreementEvidenceLink
);
router.post(
    "/agreements/:agreementId/evidence-links/suggest",
    allowRoles("renter", "landlord"),
    suggestAgreementEvidenceLinks
);
router.patch(
    "/agreements/:agreementId/evidence-links/:linkId/review",
    allowRoles("renter", "landlord"),
    reviewSuggestedEvidenceLink
);
router.post(
    "/agreements/:agreementId/evidence-links/:linkId/confirm",
    allowRoles("renter", "landlord"),
    confirmAgreementEvidenceLink
);
router.post(
    "/agreements/:agreementId/legal-links",
    allowRoles("renter", "landlord"),
    addAgreementLegalLink
);
// Approved legal sources for clauses: suggestions and hand-linking candidates.
router.get(
    "/agreements/:agreementId/legal-suggestions",
    allowRoles("renter", "landlord", "legal_reviewer", "admin"),
    listLegalSuggestions
);
router.post(
    "/agreements/:agreementId/legal-suggestions",
    allowRoles("renter", "landlord"),
    extractionLimiter,
    runLegalSuggestions
);
router.patch(
    "/agreements/:agreementId/legal-suggestions/:suggestionId",
    allowRoles("renter", "landlord"),
    reviewLegalSuggestion
);
router.get(
    "/agreements/:agreementId/clauses/:clauseId/legal-sources",
    allowRoles("renter", "landlord", "legal_reviewer", "admin"),
    listClauseLegalSources
);
router.post(
    "/agreements/:agreementId/clauses/:clauseId/rewrite-suggestions",
    allowRoles("renter", "landlord"),
    suggestClauseRewrite
);
router.patch(
    "/agreements/:agreementId/clauses/:clauseId/rewrite-suggestions/:suggestionId/response",
    allowRoles("renter", "landlord"),
    respondToClauseRewrite
);
router.patch(
    "/agreements/:agreementId/clauses/:clauseId/rewrite-suggestions/:suggestionId/assessment",
    allowRoles("legal_reviewer"),
    assessClauseRewrite
);
router.post(
    "/agreements/:agreementId/record-links",
    allowRoles("renter", "landlord"),
    addAgreementRecordLink
);
router.delete(
    "/agreements/:agreementId/record-links/:linkId",
    allowRoles("renter", "landlord"),
    removeAgreementRecordLink
);
router.post(
    "/agreements/:agreementId/clauses",
    allowRoles("renter", "landlord"),
    addAgreementClause
);
router.post(
    "/agreements/:agreementId/extract",
    allowRoles("renter", "landlord"),
    extractionLimiter,
    extractAgreement
);
router.patch(
    "/agreements/:agreementId/clauses/:clauseId/review",
    allowRoles("renter", "landlord"),
    reviewAgreementClause
);
router.post(
    "/agreements/:agreementId/obligations",
    allowRoles("renter", "landlord"),
    addAgreementObligation
);
router.patch(
    "/agreements/:agreementId/obligations/:obligationId",
    allowRoles("renter", "landlord"),
    updateAgreementObligation
);
router.post(
    "/agreements/:agreementId/payments",
    allowRoles("renter", "landlord"),
    addAgreementPayment
);
router.patch(
    "/agreements/:agreementId/payments/:paymentId",
    allowRoles("renter", "landlord"),
    updateAgreementPayment
);
router.post(
    "/agreements/:agreementId/shares",
    allowRoles("renter", "landlord"),
    shareAgreement
);
router.delete(
    "/agreements/:agreementId/shares/:userId",
    allowRoles("renter", "landlord"),
    revokeAgreementShare
);
router.patch(
    "/agreements/:agreementId/status",
    allowRoles("renter", "landlord"),
    updateTenancyAgreementStatus
);
router.get("/agreements/:agreementId", getTenancyAgreement);

export default router;
