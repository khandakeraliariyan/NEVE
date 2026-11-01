import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import MaintenanceRequest from "../src/models/MaintenanceRequest.js";
import {
    buildMaintenanceSearchFilter,
    canTransitionMaintenanceStatus,
} from "../src/services/maintenanceRequest.service.js";

const objectId = () => new mongoose.Types.ObjectId();

test("maintenance requests validate repair status and responsibility fields", () => {
    const request = new MaintenanceRequest({
        agreement: objectId(),
        property: objectId(),
        title: "Kitchen sink leak",
        description: "Water is leaking under the sink.",
        category: "plumbing",
        priority: "high",
        responsibility: "landlord",
        submittedBy: objectId(),
    });

    assert.equal(request.validateSync(), undefined);
    request.status = "unverified";
    assert.ok(request.validateSync().errors.status);
});

test("maintenance status transitions prevent reopening cancelled tickets", () => {
    assert.equal(
        canTransitionMaintenanceStatus("submitted", "acknowledged"),
        true
    );
    assert.equal(
        canTransitionMaintenanceStatus("in_progress", "completed"),
        true
    );
    assert.equal(
        canTransitionMaintenanceStatus("completed", "in_progress"),
        true
    );
    assert.equal(
        canTransitionMaintenanceStatus("cancelled", "in_progress"),
        false
    );
    assert.equal(
        canTransitionMaintenanceStatus("submitted", "completed"),
        false
    );
});

test("maintenance search covers request details and progress history with literal matching", () => {
    const { filter } = buildMaintenanceSearchFilter("leak.");
    assert.deepEqual(Object.keys(filter.$or[0]), ["title"]);
    assert.equal(filter.$or.length, 4);
    assert.equal(filter.$or[3]["history.message"].test("A leak. was fixed"), true);
    assert.equal(filter.$or[3]["history.message"].test("A leak was fixed"), false);
});

test("maintenance search rejects invalid and oversized queries", () => {
    assert.match(buildMaintenanceSearchFilter(["sink"]).error, /at most 120/);
    assert.match(
        buildMaintenanceSearchFilter("x".repeat(121)).error,
        /at most 120/
    );
    assert.deepEqual(buildMaintenanceSearchFilter("  ").filter, {});
});
