import express from "express";
import {
    addAgreementClause,
    addAgreementEvidenceLink,
    addAgreementObligation,
    addAgreementPayment,
    createTenancyAgreement,
    getAgreementEvidenceGraph,
    getAgreementEvidenceReport,
    getTenancyAgreement,
    listTenancyAgreements,
    revokeAgreementShare,
    shareAgreement,
    updateAgreementObligation,
    updateAgreementEvidenceLink,
    updateAgreementPayment,
    updateTenancyAgreementStatus,
} from "../controllers/tenancyAgreement.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
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
router.get("/agreements/:agreementId/evidence-graph", getAgreementEvidenceGraph);
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
    "/agreements/:agreementId/clauses",
    allowRoles("renter", "landlord"),
    addAgreementClause
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
