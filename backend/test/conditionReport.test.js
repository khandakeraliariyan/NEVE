import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import ConditionReport from "../src/models/ConditionReport.js";
import {
    canManageAgreement,
    isAgreementParticipant,
} from "../src/services/tenancyAgreement.service.js";
import { compareConditionReports } from "../src/services/conditionReport.service.js";

const objectId = () => new mongoose.Types.ObjectId();

test("condition reports only accept supported stages and append-only entry fields", () => {
    const agreement = objectId();
    const report = new ConditionReport({
        agreement,
        property: objectId(),
        stage: "move_in",
        createdBy: objectId(),
        entries: [
            {
                recordKey: "room:bedroom:window",
                kind: "room_condition",
                room: "Bedroom",
                item: "Window",
                condition: "fair",
                recordedBy: objectId(),
            },
        ],
    });

    assert.equal(report.validateSync(), undefined);
    report.stage = "before_lease";
    assert.ok(report.validateSync().errors.stage);
});

test("move-in and move-out comparison uses latest corrections and meter deltas", () => {
    const comparison = compareConditionReports(
        {
            stage: "move_in",
            entries: [
                {
                    _id: "old-condition",
                    recordKey: "room:kitchen:tap",
                    kind: "room_condition",
                    condition: "poor",
                    notes: "Original note",
                    supersedes: null,
                },
                {
                    _id: "corrected-condition",
                    recordKey: "room:kitchen:tap",
                    kind: "room_condition",
                    condition: "good",
                    notes: "Corrected note",
                    supersedes: "old-condition",
                },
                {
                    _id: "electricity-in",
                    recordKey: "meter:electricity",
                    kind: "meter_reading",
                    reading: 100,
                    unit: "kWh",
                    supersedes: null,
                },
            ],
        },
        {
            stage: "move_out",
            entries: [
                {
                    _id: "condition-out",
                    recordKey: "room:kitchen:tap",
                    kind: "room_condition",
                    condition: "damaged",
                    notes: "Cracked",
                    supersedes: null,
                },
                {
                    _id: "electricity-out",
                    recordKey: "meter:electricity",
                    kind: "meter_reading",
                    reading: 140,
                    unit: "kWh",
                    supersedes: null,
                },
            ],
        }
    );

    assert.equal(comparison.available, true);
    const condition = comparison.changes.find((item) =>
        item.recordKey.startsWith("room:")
    );
    const meter = comparison.changes.find((item) =>
        item.recordKey.startsWith("meter:")
    );
    assert.equal(condition.moveIn._id, "corrected-condition");
    assert.equal(condition.change, "condition_changed");
    assert.equal(meter.readingDelta, 40);
    assert.match(comparison.disclaimer, /does not determine when damage occurred/i);
});

test("condition comparison reports stages that have not been recorded", () => {
    assert.deepEqual(
        compareConditionReports(null, { stage: "move_out", entries: [] }),
        {
            available: false,
            missingStages: ["move_in"],
            changes: [],
        }
    );
});

test("assigned property managers can manage only their assigned agreement", () => {
    const renter = objectId();
    const landlord = objectId();
    const manager = objectId();
    const other = objectId();
    const agreement = {
        renter,
        landlord,
        assignedPropertyManager: manager,
        sharedWith: [],
    };

    assert.equal(canManageAgreement(agreement, manager), true);
    assert.equal(isAgreementParticipant(agreement, manager), true);
    assert.equal(canManageAgreement(agreement, other), false);
});
