import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import TenancyCase from "../src/models/TenancyCase.js";
import { resolveTenancyCaseAccessScope } from "../src/services/tenancyCase.service.js";

const objectId = () => new mongoose.Types.ObjectId();

test("tenancy case supports selected evidence and revocable reviewer access", () => {
    const tenancyCase = new TenancyCase({
        agreement: objectId(),
        title: "Deposit dispute",
        createdBy: objectId(),
        evidence: [{ file: objectId(), addedBy: objectId() }],
        sharedWith: [{ user: objectId(), sharedBy: objectId() }],
    });

    assert.equal(tenancyCase.validateSync(), undefined);
    assert.equal(tenancyCase.evidence[0].removedAt, null);
    assert.equal(tenancyCase.sharedWith[0].revokedAt, null);
});

test("tenancy case rejects unsupported statuses", () => {
    const tenancyCase = new TenancyCase({
        agreement: objectId(),
        title: "Deposit dispute",
        createdBy: objectId(),
        status: "liable",
    });

    assert.ok(tenancyCase.validateSync().errors.status);
});

test("case access distinguishes participants, shared reviewers, and revoked shares", () => {
    const renter = objectId();
    const outsider = objectId();
    const mediator = objectId();
    const agreement = {
        renter,
        landlord: objectId(),
    };
    const tenancyCase = {
        sharedWith: [
            { user: mediator, revokedAt: null },
            { user: objectId(), revokedAt: new Date() },
        ],
    };

    assert.equal(
        resolveTenancyCaseAccessScope({
            tenancyCase,
            agreement,
            userId: renter,
            userRole: "renter",
        }),
        "manage"
    );
    assert.equal(
        resolveTenancyCaseAccessScope({
            tenancyCase,
            agreement,
            userId: outsider,
            userRole: "renter",
        }),
        null
    );
    assert.equal(
        resolveTenancyCaseAccessScope({
            tenancyCase,
            agreement: null,
            userId: mediator,
            userRole: "mediator",
        }),
        "read_only"
    );
    assert.equal(
        resolveTenancyCaseAccessScope({
            tenancyCase,
            agreement: null,
            userId: objectId(),
            userRole: "renter",
        }),
        null
    );
});
