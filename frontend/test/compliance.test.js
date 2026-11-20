import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import {
    complianceSummary,
    completeObligation,
    guessCategory,
    nextDueDate,
    obligationState,
    validateObligationExtras,
} from "../src/server/services/compliance.service.js";
import { sendOverdueObligationNotices } from "../src/server/services/notificationReminders.service.js";

const now = new Date("2026-03-10T12:00:00Z");
const id = () => new mongoose.Types.ObjectId();

test("next due dates keep the day of the month where possible", () => {
    assert.equal(nextDueDate(new Date("2026-01-31T00:00:00Z"), "monthly").toISOString(), "2026-02-28T00:00:00.000Z");
    assert.equal(nextDueDate(new Date("2026-01-05T00:00:00Z"), "quarterly").toISOString(), "2026-04-05T00:00:00.000Z");
    assert.equal(nextDueDate(new Date("2026-01-05T00:00:00Z"), "weekly").toISOString(), "2026-01-12T00:00:00.000Z");
    assert.equal(nextDueDate(new Date("2024-02-29T00:00:00Z"), "yearly").toISOString(), "2025-02-28T00:00:00.000Z");
    assert.equal(nextDueDate(new Date(), "none"), null);
});

test("states: overdue, due soon, upcoming, no date, done", () => {
    assert.equal(obligationState({ status: "open", dueAt: new Date("2026-03-01") }, now), "overdue");
    assert.equal(obligationState({ status: "open", dueAt: new Date("2026-03-15") }, now), "due_soon");
    assert.equal(obligationState({ status: "open", dueAt: new Date("2026-04-15") }, now), "upcoming");
    assert.equal(obligationState({ status: "open", dueAt: null }, now), "no_date");
    assert.equal(obligationState({ status: "completed", dueAt: new Date("2026-03-01") }, now), "completed");
});

test("completing a recurring obligation records it and moves to the next date", () => {
    const actor = id();
    const rent = { status: "open", dueAt: new Date("2026-03-05T00:00:00Z"), recurrence: { frequency: "monthly", until: new Date("2026-04-30") }, completions: [] };
    const first = completeObligation(rent, { actor, now, note: "paid by bKash" });
    assert.equal(first.recurring, true);
    assert.equal(rent.status, "open");
    assert.equal(rent.dueAt.toISOString(), "2026-04-05T00:00:00.000Z");
    assert.equal(rent.completions.length, 1);
    assert.equal(rent.completions[0].note, "paid by bKash");

    // The next one would be after "until", so the series ends.
    const last = completeObligation(rent, { actor, now });
    assert.equal(last.recurring, false);
    assert.equal(rent.status, "completed");
    assert.equal(rent.completions.length, 2);

    const once = { status: "open", dueAt: null, recurrence: { frequency: "none" } };
    completeObligation(once, { actor, now });
    assert.equal(once.status, "completed");
});

test("extra obligation fields are validated", () => {
    assert.deepEqual(validateObligationExtras({ category: "payment" }).value, { category: "payment" });
    assert.ok(validateObligationExtras({ category: "tax" }).error);
    assert.ok(validateObligationExtras({ recurrence: { frequency: "daily" } }).error);
    assert.ok(validateObligationExtras({ recurrence: { frequency: "monthly" }, dueAt: null }).error);
    assert.equal(validateObligationExtras({ recurrence: { frequency: "monthly" }, dueAt: "2026-04-01" }).value.recurrence.frequency, "monthly");
    assert.equal(guessCategory("Pay rent by the 5th"), "payment");
    assert.equal(guessCategory("Repair the roof"), "maintenance");
});

test("the summary counts states and the user's own responsibilities", () => {
    const renter = id();
    const agreements = [
        {
            _id: id(),
            title: "Flat 3B",
            renter,
            landlord: id(),
            obligations: [
                { _id: id(), description: "Rent", responsibleParty: "renter", category: "payment", status: "open", dueAt: new Date("2026-03-05"), recurrence: { frequency: "monthly" } },
                { _id: id(), description: "Fix tap", responsibleParty: "landlord", category: "maintenance", status: "open", dueAt: new Date("2026-03-12") },
                { _id: id(), description: "Return keys", responsibleParty: "shared", status: "completed", dueAt: null },
            ],
            extraction: { proposedObligations: [{ decision: { status: "pending" } }, { decision: { status: "accepted" } }] },
        },
    ];
    const summary = complianceSummary(agreements, renter, now);
    assert.equal(summary.totals.overdue, 1);
    assert.equal(summary.totals.due_soon, 1);
    assert.equal(summary.totals.completed, 1);
    assert.equal(summary.totals.recurring, 1);
    assert.equal(summary.totals.proposed, 1);
    assert.deepEqual(summary.mine, { overdue: 1, due_soon: 0, open: 1 });
    assert.equal(summary.items[0].state, "overdue");
    assert.equal(summary.items[0].daysOverdue, 5);
    assert.equal(summary.agreements[0].onTrackPercent, 67);
});

test("overdue notices go to both parties once per due date", async () => {
    const obligationId = id();
    const agreement = { _id: id(), title: "Flat", renter: id(), landlord: id(), obligations: [{ _id: obligationId, description: "Rent", status: "open", dueAt: new Date("2026-03-05"), overdueNotifiedFor: null }] };
    let claims = 0;
    const AgreementModel = {
        find: () => ({ select: () => ({ limit: () => ({ lean: async () => [agreement] }) }) }),
        updateOne: async () => ({ modifiedCount: claims++ === 0 ? 1 : 0 }),
    };
    const sent = [];
    const createNotification = async (n) => {
        sent.push(n);
        return n;
    };
    assert.equal(await sendOverdueObligationNotices(now, { AgreementModel, createNotification }), 2);
    assert.equal(sent[0].type, "obligation_overdue");
    // A second run finds the claim already taken.
    assert.equal(await sendOverdueObligationNotices(now, { AgreementModel, createNotification }), 0);
});
