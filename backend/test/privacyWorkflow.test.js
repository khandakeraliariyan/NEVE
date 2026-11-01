import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import DocumentDeletionRequest from "../src/models/DocumentDeletionRequest.js";
import SensitiveAccessLog from "../src/models/SensitiveAccessLog.js";
import UploadedFile from "../src/models/UploadedFile.js";

const objectId = () => new mongoose.Types.ObjectId();

test("document deletion requests require a reason and use supported review states", () => {
    const request = new DocumentDeletionRequest({
        fileId: objectId(),
        requester: objectId(),
        reason: "I uploaded the wrong document.",
    });

    assert.equal(request.validateSync(), undefined);
    request.status = "deleted";
    assert.ok(request.validateSync().errors.status);
});

test("sensitive access logs require actor, action, and a supported resource", () => {
    const log = new SensitiveAccessLog({
        actor: objectId(),
        action: "file_access_url_issued",
        resourceType: "file",
        resourceId: objectId(),
    });

    assert.equal(log.validateSync(), undefined);
    log.resourceType = "public_listing";
    assert.ok(log.validateSync().errors.resourceType);
});

test("uploaded tenancy files support retention dates and legal holds", () => {
    const file = new UploadedFile({
        uploadedBy: objectId(),
        purpose: "tenancy_evidence",
        originalName: "lease.pdf",
        storageKey: "private-evidence/test/lease.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1200,
        retentionUntil: new Date("2030-01-01T00:00:00.000Z"),
        legalHold: true,
    });

    assert.equal(file.validateSync(), undefined);
});
