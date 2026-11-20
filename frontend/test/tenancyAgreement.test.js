import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import TenancyAgreement from "../src/server/models/TenancyAgreement.js";
import TenancyEvidenceLink from "../src/server/models/TenancyEvidenceLink.js";
import { isAgreementParticipant } from "../src/server/services/tenancyAgreement.service.js";

const objectId = () => new mongoose.Types.ObjectId();

test("agreement visibility is limited to its participants and active shares", () => {
    const renter = objectId();
    const landlord = objectId();
    const reviewer = objectId();
    const revokedReviewer = objectId();
    const agreement = {
        renter,
        landlord,
        sharedWith: [
            { user: reviewer, revokedAt: null },
            { user: revokedReviewer, revokedAt: new Date() },
        ],
    };

    assert.equal(isAgreementParticipant(agreement, renter), true);
    assert.equal(isAgreementParticipant(agreement, landlord), true);
    assert.equal(isAgreementParticipant(agreement, reviewer), true);
    assert.equal(isAgreementParticipant(agreement, revokedReviewer), false);
    assert.equal(isAgreementParticipant(agreement, objectId()), false);
});

test("agreement records enforce Bangladesh jurisdiction and supported workflow states", () => {
    const agreement = new TenancyAgreement({
        property: objectId(),
        inquiry: objectId(),
        renter: objectId(),
        landlord: objectId(),
        createdBy: objectId(),
        documentFile: objectId(),
        title: "Residential tenancy agreement",
        jurisdiction: "Bangladesh",
        status: "shared",
    });

    assert.equal(agreement.validateSync(), undefined);
    agreement.status = "signed";
    assert.ok(agreement.validateSync().errors.status);
});

test("tenancy evidence relationships are constrained and auditable", () => {
    const link = new TenancyEvidenceLink({
        agreement: objectId(),
        targetType: "payment",
        targetId: objectId(),
        uploadedFile: objectId(),
        relationship: "contradicts",
        linkedBy: objectId(),
        history: [
            {
                actor: objectId(),
                relationship: "contradicts",
                explanation: "Receipt amount differs from the recorded payment.",
            },
        ],
    });

    assert.equal(link.validateSync(), undefined);
    link.relationship = "proves_liability";
    assert.ok(link.validateSync().errors.relationship);

    link.relationship = "supports";
    link.confidence = 1.1;
    assert.ok(link.validateSync().errors.confidence);
});
