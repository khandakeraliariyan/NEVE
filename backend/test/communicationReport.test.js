import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import CommunicationReport from "../src/models/CommunicationReport.js";

test("communication reports require supported reasons and retain review state", () => {
    const report = new CommunicationReport({
        inquiry: new mongoose.Types.ObjectId(),
        message: new mongoose.Types.ObjectId(),
        reporter: new mongoose.Types.ObjectId(),
        reportedUser: new mongoose.Types.ObjectId(),
        reason: "off_platform_payment",
        details: "The sender requested a deposit outside the platform.",
    });

    assert.equal(report.validateSync(), undefined);
    assert.equal(report.status, "pending");

    report.reason = "not_a_reason";
    assert.ok(report.validateSync().errors.reason);
});
