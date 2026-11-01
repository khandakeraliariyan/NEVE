import express from "express";
import {
    addAgreementClause,
    addAgreementEvidenceLink,
    addAgreementObligation,
    addAgreementPayment,
    createTenancyAgreement,
    getAgreementEvidenceGraph,
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

const router = express.Router();

router.use(authenticateUser, allowRoles("renter", "landlord", "mediator", "legal_reviewer"));

router.post("/agreements", allowRoles("renter", "landlord"), createTenancyAgreement);
router.get("/agreements", listTenancyAgreements);
router.get("/agreements/:agreementId/evidence-graph", getAgreementEvidenceGraph);
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
