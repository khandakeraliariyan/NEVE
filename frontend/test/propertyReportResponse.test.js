import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import {
    getReportsAboutMyListings,
    landlordView,
    respondToPropertyReport,
    validateLandlordResponse,
} from "../src/server/controllers/propertyReport.controller.js";
import Notification from "../src/server/models/Notification.js";
import {
    notifyListingReported,
    notifyListingReportResponded,
} from "../src/server/services/notificationEvents.service.js";
import Property from "../src/server/models/Property.js";
import PropertyReport from "../src/server/models/PropertyReport.js";
import User from "../src/server/models/User.js";

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();

function response() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

async function run(handler, req) {
    const res = response();
    await handler(req, res, (error) => { throw error; });
    return res;
}

// Admin lookups and notification writes, so nothing touches a database.
function quietNotifications(admins = []) {
    mock.method(User, "find", () => ({ distinct: async () => admins }));
    return mock.method(Notification, "create", async (doc) => ({ _id: id(), ...doc }));
}

test("a report notifies the admins and the landlord, without naming the reporter", async () => {
    const admin = id();
    const landlord = id();
    const created = quietNotifications([admin]);
    await notifyListingReported({ property: { _id: id(), title: "Lake Flat", landlord }, reason: "misleading_photos" });

    const recipients = created.mock.calls.map((call) => String(call.arguments[0].recipient));
    assert.deepEqual(recipients.sort(), [String(admin), String(landlord)].sort());
    const toLandlord = created.mock.calls.map((call) => call.arguments[0]).find((n) => String(n.recipient) === String(landlord));
    assert.equal(toLandlord.link, "/listings/warnings");
    assert.match(toLandlord.message, /misleading photos/);
});

test("a landlord's reply notifies the admins", async () => {
    const admin = id();
    const created = quietNotifications([admin]);
    await notifyListingReportResponded({ property: { _id: id(), title: "Lake Flat" } });
    assert.equal(created.mock.callCount(), 1);
    assert.equal(String(created.mock.calls[0].arguments[0].recipient), String(admin));
    assert.equal(created.mock.calls[0].arguments[0].link, "/admin/moderation");
});

test("a reply needs 10 to 2000 characters", () => {
    assert.equal(validateLandlordResponse({}).status, 400);
    assert.equal(validateLandlordResponse({ text: 42 }).status, 400);
    assert.equal(validateLandlordResponse({ text: "   too short   " }).status, 400);
    assert.equal(validateLandlordResponse({ text: "x".repeat(2001) }).status, 400);
    assert.deepEqual(validateLandlordResponse({ text: "  The flat is available.  " }).value, { text: "The flat is available." });
});

test("the landlord's view never includes who reported the listing", () => {
    const view = landlordView({
        _id: id(),
        property: { title: "Flat" },
        reporter: { _id: id(), displayName: "Reporter", email: "r@example.com" },
        reason: "inaccurate_details",
        details: "Wrong rent",
        status: "pending",
        reviewNote: "internal admin note",
        reviewedBy: id(),
        landlordResponse: { text: "", respondedAt: null },
    });
    assert.equal("reporter" in view, false);
    assert.equal("reviewNote" in view, false);
    assert.equal("reviewedBy" in view, false);
    assert.equal(view.landlordResponse, null);
    assert.equal(view.canRespond, true);
    assert.equal(landlordView({ status: "resolved" }).canRespond, false);
});

test("a landlord lists only reports on their own listings", async () => {
    const landlord = id();
    const mine = [{ _id: id() }, { _id: id() }];
    const propertyFind = mock.method(Property, "find", () => ({ select: () => ({ lean: async () => mine }) }));
    let filterUsed;
    mock.method(PropertyReport, "find", (filter) => {
        filterUsed = filter;
        const chain = {
            populate: () => chain, sort: () => chain, skip: () => chain, limit: () => chain,
            lean: async () => [{ _id: id(), reporter: id(), reason: "other", status: "pending" }],
        };
        return chain;
    });
    mock.method(PropertyReport, "countDocuments", async () => 1);

    const res = await run(getReportsAboutMyListings, { neveUser: { _id: landlord }, query: {} });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(propertyFind.mock.calls[0].arguments[0], { landlord });
    assert.deepEqual(filterUsed, { property: { $in: mine.map((p) => p._id) } });
    assert.equal("reporter" in res.body.data[0], false);
    assert.equal(res.body.pagination.total, 1);
});

test("bad pagination is refused", async () => {
    const res = await run(getReportsAboutMyListings, { neveUser: { _id: id() }, query: { limit: "500" } });
    assert.equal(res.statusCode, 400);
});

function reportFor(landlord, status = "pending") {
    const report = {
        _id: id(),
        status,
        reason: "inaccurate_details",
        property: { _id: id(), title: "Flat", landlord },
        landlordResponse: { text: "", respondedAt: null },
        save: mock.fn(async () => report),
    };
    mock.method(PropertyReport, "findById", () => ({ populate: async () => report }));
    return report;
}

test("a landlord can reply to an open report on their listing", async () => {
    quietNotifications();
    const landlord = id();
    const report = reportFor(landlord);

    const res = await run(respondToPropertyReport, {
        neveUser: { _id: landlord },
        params: { reportId: String(report._id) },
        body: { text: "  The rent shown is correct; see the agreement.  " },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(report.save.mock.callCount(), 1);
    assert.equal(report.landlordResponse.text, "The rent shown is correct; see the agreement.");
    assert.ok(report.landlordResponse.respondedAt instanceof Date);
    assert.equal(res.body.data.landlordResponse.text, "The rent shown is correct; see the agreement.");
});

test("another landlord's report looks like a missing one", async () => {
    const report = reportFor(id());
    const res = await run(respondToPropertyReport, {
        neveUser: { _id: id() },
        params: { reportId: String(report._id) },
        body: { text: "This is not my listing at all." },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(report.save.mock.callCount(), 0);
});

test("a closed report can't take a reply", async () => {
    const landlord = id();
    for (const status of ["resolved", "dismissed"]) {
        const report = reportFor(landlord, status);
        const res = await run(respondToPropertyReport, {
            neveUser: { _id: landlord },
            params: { reportId: String(report._id) },
            body: { text: "Replying after it was closed." },
        });
        assert.equal(res.statusCode, 409);
        assert.equal(report.save.mock.callCount(), 0);
        mock.restoreAll();
    }
});

test("an invalid ID or short reply is refused before any lookup", async () => {
    const findById = mock.method(PropertyReport, "findById", () => { throw new Error("should not look up"); });
    const bad = await run(respondToPropertyReport, { neveUser: { _id: id() }, params: { reportId: "nope" }, body: { text: "A long enough reply." } });
    assert.equal(bad.statusCode, 400);
    const short = await run(respondToPropertyReport, { neveUser: { _id: id() }, params: { reportId: String(id()) }, body: { text: "short" } });
    assert.equal(short.statusCode, 400);
    assert.equal(findById.mock.callCount(), 0);
});
