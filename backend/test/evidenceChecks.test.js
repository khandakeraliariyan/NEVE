import assert from "node:assert/strict";
import test from "node:test";

import { findMeterReadingIssues, findPaymentConflicts } from "../src/services/evidenceChecks.service.js";

const renter = "u-renter";
const landlord = "u-landlord";

test("flags renter and landlord recording different rent for one month", () => {
    const conflicts = findPaymentConflicts({
        monthlyRentBdt: 20000,
        payments: [
            { _id: "p1", paymentType: "rent", amountBdt: 20000, paidAt: new Date("2026-02-03"), recordedBy: renter },
            { _id: "p2", paymentType: "rent", amountBdt: 15000, paidAt: new Date("2026-02-04"), recordedBy: landlord },
        ],
    });
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].type, "conflicting_payment_records");
    assert.equal(conflicts[0].month, "2026-02");
});

test("flags a month's rent total that differs from the agreed rent", () => {
    const conflicts = findPaymentConflicts({
        monthlyRentBdt: 20000,
        payments: [
            { _id: "p1", paymentType: "rent", amountBdt: 10000, paidAt: new Date("2026-03-01"), recordedBy: renter },
            { _id: "p2", paymentType: "rent", amountBdt: 10000, paidAt: new Date("2026-03-15"), recordedBy: renter },
            { _id: "p3", paymentType: "rent", amountBdt: 18000, paidAt: new Date("2026-04-01"), recordedBy: renter },
        ],
    });
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].month, "2026-04");
    assert.equal(conflicts[0].recordedTotalBdt, 18000);
});

test("checks deposit and advance totals", () => {
    const conflicts = findPaymentConflicts({
        depositBdt: 40000,
        advanceRentBdt: 20000,
        payments: [
            { _id: "d1", paymentType: "deposit", amountBdt: 30000, paidAt: new Date(), recordedBy: renter },
            { _id: "a1", paymentType: "advance", amountBdt: 20000, paidAt: new Date(), recordedBy: renter },
        ],
    });
    assert.deepEqual(conflicts.map((c) => c.paymentType), ["deposit"]);
});

test("no agreed amount means no mismatch", () => {
    assert.deepEqual(
        findPaymentConflicts({ payments: [{ _id: "p1", paymentType: "rent", amountBdt: 1, paidAt: new Date(), recordedBy: renter }] }),
        []
    );
});

const reading = (id, meterType, value, extra = {}) => ({ _id: id, kind: "meter_reading", meterType, reading: value, recordedAt: new Date("2026-01-01"), ...extra });

test("flags missing and decreasing meter readings", () => {
    const { missing, conflicts } = findMeterReadingIssues([
        { _id: "in", stage: "move_in", entries: [reading("e1", "electricity", 1000), reading("g1", "gas", 50)] },
        { _id: "out", stage: "move_out", entries: [reading("e2", "electricity", 900)] },
    ]);
    assert.deepEqual(missing.map((m) => [m.type, m.meterType]), [["missing_meter_reading", "gas"]]);
    assert.equal(conflicts[0].type, "meter_reading_decreased");
});

test("ignores superseded readings and flags reports without any", () => {
    const { missing, conflicts } = findMeterReadingIssues([
        {
            _id: "in",
            stage: "move_in",
            entries: [reading("e1", "electricity", 5), reading("e1b", "electricity", 1000, { supersedes: "e1", recordedAt: new Date("2026-01-02") })],
        },
        { _id: "out", stage: "move_out", entries: [{ _id: "r", kind: "room_condition" }] },
    ]);
    assert.deepEqual(missing.map((m) => [m.type, m.stage]), [["missing_meter_readings", "move_out"]]);
    assert.deepEqual(conflicts, []);
});
