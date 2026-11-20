import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import { canSeeDocument, documentStatus, validateDocumentInput } from "../src/server/services/tenancyDocument.service.js";

const renter = new mongoose.Types.ObjectId();
const landlord = new mongoose.Types.ObjectId();
const agreement = { renter, landlord };

test("private documents are visible only to their owner", () => {
    assert.equal(canSeeDocument({ visibility: "shared", owner: renter }, landlord), true);
    assert.equal(canSeeDocument({ visibility: "private", owner: renter }, landlord), false);
    assert.equal(canSeeDocument({ visibility: "private", owner: renter }, renter), true);
});

test("document input is validated, with rules for notices and amendments", () => {
    const { value } = validateDocumentInput({ category: "receipt", title: " March rent ", fileId: "x", visibility: "private" });
    assert.deepEqual(value, { category: "receipt", title: "March rent", visibility: "private" });
    assert.ok(validateDocumentInput({ category: "tax", title: "x" }).error);
    assert.ok(validateDocumentInput({ category: "receipt", title: "" }).error);
    assert.ok(validateDocumentInput({ category: "notice", title: "Leaving" }).error);
    assert.equal(validateDocumentInput({ category: "notice", title: "Leaving", notice: { noticeType: "termination", servedAt: "2026-03-01" } }).value.notice.noticeType, "termination");
    assert.ok(validateDocumentInput({ category: "amendment", title: "Rent change", visibility: "private" }).error);
    assert.ok(validateDocumentInput({ category: "receipt", title: "x", owner: "me" }).error);
    assert.deepEqual(validateDocumentInput({ title: "Renamed" }, { partial: true }).value, { title: "Renamed" });
});

test("amendments need the other party's acceptance; notices their acknowledgement", () => {
    const amendment = { category: "amendment", owner: landlord, responses: [] };
    assert.equal(documentStatus(amendment, agreement), "proposed");
    amendment.responses = [{ user: renter, response: "accepted" }];
    assert.equal(documentStatus(amendment, agreement), "agreed");
    amendment.responses = [{ user: renter, response: "rejected" }];
    assert.equal(documentStatus(amendment, agreement), "rejected");

    const notice = { category: "notice", owner: renter, responses: [] };
    assert.equal(documentStatus(notice, agreement), "served");
    notice.responses = [{ user: landlord, response: "acknowledged" }];
    assert.equal(documentStatus(notice, agreement), "acknowledged");
    assert.equal(documentStatus({ category: "receipt", owner: renter }, agreement), null);
});
