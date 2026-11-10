import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import {
    InvitationSchema,
    acceptInvitation,
    cancelInvitation,
    createInvitation,
    declineInvitation,
    effectiveStatus,
} from "../src/controllers/tenancyInvitation.controller.js";
import Inquiry from "../src/models/Inquiry.js";
import Notification from "../src/models/Notification.js";
import Property from "../src/models/Property.js";
import TenancyAgreement from "../src/models/TenancyAgreement.js";
import TenancyInvitation from "../src/models/TenancyInvitation.js";
import User from "../src/models/User.js";
import PlatformSetting from "../src/models/PlatformSetting.js";
import { clearSettingsCache } from "../src/services/platformSettings.service.js";
import { buildAgreementEvidenceReport } from "../src/services/evidenceReport.service.js";
import { buildChronology, renderEvidenceReportPdf, scriptRuns } from "../src/services/reportPdf.service.js";

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();

function response() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        set() { return this; },
    };
}

async function run(handler, req) {
    const res = response();
    await handler(req, res, (error) => { throw error; });
    return res;
}

// --- PDF report -----------------------------------------------------------------

function sampleReport() {
    const renter = id();
    const landlord = id();
    const paymentId = id();
    const fileId = id();
    const agreement = {
        _id: id(),
        title: "Flat 4B lease",
        status: "disputed",
        jurisdiction: "Bangladesh",
        renter,
        landlord,
        startAt: new Date("2026-01-01"),
        endAt: new Date("2026-12-31"),
        monthlyRentBdt: 25000,
        depositBdt: 50000,
        advanceRentBdt: null,
        clauses: [{ _id: id(), heading: "নোটিশ", category: "notice", text: "দুই মাস আগে নোটিশ দিবেন।", origin: "user", reviewStatus: "confirmed" }],
        obligations: [],
        payments: [{ _id: paymentId, paymentType: "rent", amountBdt: 30000, paidAt: new Date("2026-01-04"), payer: "renter", status: "recorded" }],
        extraction: null,
        auditTrail: [{ actor: renter, action: "agreement_created", createdAt: new Date("2026-01-01") }],
    };
    const links = [{
        _id: id(),
        targetType: "payment",
        targetId: paymentId,
        uploadedFile: { _id: fileId },
        relationship: "contradicts",
        explanation: "Receipt shows BDT 20,000.",
        confirmations: [],
        history: [],
        createdAt: new Date("2026-01-10"),
    }];
    const files = [{ _id: fileId, originalName: "receipt.jpg", mimeType: "image/jpeg", sizeBytes: 1000, status: "uploaded", sha256: "ab".repeat(32) }];
    const messages = [{ _id: id(), body: "I paid 30,000.", sender: { _id: renter, displayName: "Rina", role: "renter" }, createdAt: new Date("2026-01-06") }];
    return buildAgreementEvidenceReport({ agreement, links, files, messages, generatedAt: new Date("2026-02-01") });
}

test("the dispute report renders as a PDF with its sections and Bangla text", async () => {
    const report = sampleReport();
    const pdf = renderEvidenceReportPdf(report, { propertyTitle: "Shanta Tower", renterName: "Rina", landlordName: "Lamia" });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
    const doc = await task.promise;
    let text = "";
    for (let n = 1; n <= doc.numPages; n += 1) {
        const page = await doc.getPage(n);
        text += (await page.getTextContent()).items.map((item) => item.str).join(" ");
    }
    await task.destroy();
    for (const expected of ["Tenancy evidence and dispute report", "Shanta Tower", "Possible conflicts", "Chronology", "Messages between the parties", "Limitations", "receipt.jpg"]) {
        assert.ok(text.includes(expected), `PDF should contain "${expected}"`);
    }
    assert.match(text, /BDT 30,000/);
});

test("Bangla, including the danda, is drawn with the Bengali font", () => {
    const runs = scriptRuns("Rent ভাড়া নয়। OK");
    assert.deepEqual(runs.map((run) => run.bengali), [false, true, false]);
    assert.equal(runs[1].text, "ভাড়া নয়। ");
});

test("the chronology is in date order and includes payments and messages", () => {
    const events = buildChronology(sampleReport(), {});
    const times = events.map((event) => event.at.getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    assert.ok(events.some((event) => /Rent payment of BDT 30,000/.test(event.text)));
    assert.ok(events.some((event) => /Message from Rina/.test(event.text)));
});

// --- Invitations ------------------------------------------------------------------

test("invitations are validated", () => {
    const base = { propertyId: String(id()), renterEmail: " Rina@Example.com ", title: "Flat 4B" };
    const parsed = InvitationSchema.safeParse(base);
    assert.ok(parsed.success);
    assert.equal(parsed.data.renterEmail, "rina@example.com");
    assert.equal(InvitationSchema.safeParse({ ...base, renterEmail: "nope" }).success, false);
    assert.equal(InvitationSchema.safeParse({ ...base, startAt: "2026-05-01", endAt: "2026-01-01" }).success, false);
    assert.equal(InvitationSchema.safeParse({ ...base, depositBdt: -1 }).success, false);
    assert.equal(InvitationSchema.safeParse({ ...base, renter: "x" }).success, false);
});

test("a pending invitation past its date reads as expired", () => {
    assert.equal(effectiveStatus({ status: "pending", expiresAt: new Date(Date.now() - 1000) }), "expired");
    assert.equal(effectiveStatus({ status: "pending", expiresAt: new Date(Date.now() + 1000) }), "pending");
    assert.equal(effectiveStatus({ status: "accepted", expiresAt: new Date(0) }), "accepted");
});

test("a landlord invites a renter who already has an account", async () => {
    const landlord = { _id: id(), role: "landlord", displayName: "Lamia", email: "lamia@example.com" };
    const property = { _id: id(), title: "Shanta Tower" };
    clearSettingsCache();
    mock.method(PlatformSetting, "findById", () => ({ lean: async () => ({ invitationExpiryDays: 7 }) }));
    mock.method(Property, "findOne", () => ({ select: async () => property }));
    mock.method(TenancyInvitation, "updateMany", async () => ({}));
    const created = mock.method(TenancyInvitation, "create", async (doc) => ({ _id: id(), ...doc, save: async () => {}, toObject() { return { ...this }; } }));
    const renter = { _id: id() };
    mock.method(User, "findOne", () => ({ select: async () => renter }));
    const notified = mock.method(Notification, "create", async (doc) => doc);

    const res = await run(createInvitation, {
        neveUser: landlord,
        body: { propertyId: String(property._id), renterEmail: "rina@example.com", title: "Flat 4B", monthlyRentBdt: 25000 },
    });

    assert.equal(res.statusCode, 201);
    assert.equal(created.mock.calls[0].arguments[0].inviteeEmail, "rina@example.com");
    // Expiry comes from the platform settings (7 days here).
    const days = (created.mock.calls[0].arguments[0].expiresAt - Date.now()) / 86_400_000;
    assert.ok(days > 6.9 && days <= 7);
    assert.equal(res.body.data.delivery, "in_app");
    assert.match(res.body.data.link, /\/invitations\//);
    const notice = notified.mock.calls[0].arguments[0];
    assert.equal(notice.type, "tenancy_invitation_received");
    assert.equal(String(notice.recipient), String(renter._id));
});

test("renters can't send invitations and landlords can't invite themselves", async () => {
    assert.equal((await run(createInvitation, { neveUser: { _id: id(), role: "renter" }, body: {} })).statusCode, 403);
    const res = await run(createInvitation, {
        neveUser: { _id: id(), role: "landlord", email: "lamia@example.com" },
        body: { propertyId: String(id()), renterEmail: "LAMIA@example.com", title: "x" },
    });
    assert.equal(res.statusCode, 400);
});

function pendingInvitation(overrides = {}) {
    return {
        _id: id(),
        property: { _id: id(), title: "Shanta Tower" },
        landlord: { _id: id(), displayName: "Lamia" },
        inviteeEmail: "rina@example.com",
        title: "Flat 4B",
        message: "",
        status: "pending",
        expiresAt: new Date(Date.now() + 86_400_000),
        documentFile: null,
        startAt: null,
        endAt: null,
        monthlyRentBdt: 25000,
        depositBdt: null,
        advanceRentBdt: null,
        createdAt: new Date(),
        ...overrides,
    };
}

function mockFindById(invitation) {
    mock.method(TenancyInvitation, "findById", () => ({ populate: () => ({ populate: async () => invitation }) }));
}

const renterUser = () => ({ _id: id(), role: "renter", displayName: "Rina", email: "rina@example.com" });

test("the invited renter accepts and the agreement is created", async () => {
    const invitation = pendingInvitation();
    mockFindById(invitation);
    mock.method(TenancyInvitation, "findOneAndUpdate", async () => ({ ...invitation, status: "accepted" }));
    mock.method(TenancyInvitation, "updateOne", async () => ({}));
    const inquiry = mock.method(Inquiry, "create", async (doc) => ({ _id: id(), ...doc }));
    const agreement = mock.method(TenancyAgreement, "create", async (doc) => ({ _id: id(), ...doc }));
    const notified = mock.method(Notification, "create", async (doc) => doc);
    const { default: SensitiveAccessLog } = await import("../src/models/SensitiveAccessLog.js");
    mock.method(SensitiveAccessLog, "findOne", () => ({ sort: () => ({ select: () => ({ lean: async () => null }) }) }));
    mock.method(SensitiveAccessLog, "create", async (doc) => doc);
    const renter = renterUser();

    const res = await run(acceptInvitation, {
        params: { invitationId: String(invitation._id) },
        neveUser: renter,
        user: { email: "rina@example.com", emailVerified: true },
    });

    assert.equal(res.statusCode, 201);
    const created = agreement.mock.calls[0].arguments[0];
    assert.equal(String(created.renter), String(renter._id));
    assert.equal(String(created.landlord), String(invitation.landlord._id));
    assert.equal(created.monthlyRentBdt, 25000);
    assert.equal(created.documentFile, null);
    assert.equal(String(created.invitation), String(invitation._id));
    // A message thread is created so the two can talk on the record.
    assert.equal(inquiry.mock.calls[0].arguments[0].status, "accepted");
    assert.equal(notified.mock.calls[0].arguments[0].type, "tenancy_invitation_accepted");
});

test("someone else, an unverified email, a landlord account or an expired invitation can't accept", async () => {
    const invitation = pendingInvitation();
    mockFindById(invitation);
    const params = { invitationId: String(invitation._id) };

    const stranger = await run(acceptInvitation, { params, neveUser: { ...renterUser(), email: "other@example.com" }, user: { emailVerified: true } });
    assert.equal(stranger.statusCode, 404);

    const unverified = await run(acceptInvitation, { params, neveUser: renterUser(), user: { emailVerified: false } });
    assert.equal(unverified.statusCode, 403);

    const ownerAccount = await run(acceptInvitation, { params, neveUser: { ...renterUser(), role: "landlord" }, user: { emailVerified: true } });
    assert.equal(ownerAccount.statusCode, 409);

    mock.restoreAll();
    mockFindById(pendingInvitation({ expiresAt: new Date(Date.now() - 1000) }));
    const expired = await run(acceptInvitation, { params, neveUser: renterUser(), user: { emailVerified: true } });
    assert.equal(expired.statusCode, 409);
});

test("the renter declines with a reason, and the landlord can cancel", async () => {
    const invitation = pendingInvitation();
    mockFindById(invitation);
    const update = mock.method(TenancyInvitation, "findOneAndUpdate", async (filter, change) => ({ ...invitation, ...change.$set }));
    const notified = mock.method(Notification, "create", async (doc) => doc);
    const declined = await run(declineInvitation, {
        params: { invitationId: String(invitation._id) },
        body: { reason: "Found another flat" },
        neveUser: renterUser(),
        user: { emailVerified: true },
    });
    assert.equal(declined.statusCode, 200);
    assert.equal(update.mock.calls[0].arguments[1].$set.declineReason, "Found another flat");
    assert.equal(notified.mock.calls[0].arguments[0].type, "tenancy_invitation_declined");

    const cancelled = await run(cancelInvitation, {
        params: { invitationId: String(invitation._id) },
        neveUser: { _id: invitation.landlord._id, role: "landlord" },
        user: {},
    });
    assert.equal(cancelled.statusCode, 200);
});
