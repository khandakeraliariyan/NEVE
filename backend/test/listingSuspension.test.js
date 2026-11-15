import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import {
    changeListingSuspension,
    validateSuspensionChange,
} from "../src/controllers/listingSuspension.controller.js";
import { updatePropertyStatus } from "../src/controllers/property.controller.js";
import AdminAuditLog from "../src/models/AdminAuditLog.js";
import Notification from "../src/models/Notification.js";
import Property from "../src/models/Property.js";

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();
const lean = (value) => ({ lean: async () => value });

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

test("suspending needs a reason and a listing that isn't suspended yet", () => {
    const listing = { status: "published", moderation: { suspended: false } };
    assert.equal(validateSuspensionChange({ action: "hide" }, listing).status, 400);
    assert.equal(validateSuspensionChange({ action: "suspend", reason: "  " }, listing).status, 400);
    assert.equal(validateSuspensionChange({ action: "suspend", reason: "x".repeat(1001) }, listing).status, 400);
    assert.equal(validateSuspensionChange({ action: "suspend", reason: "Fake" }, { status: "paused", moderation: { suspended: true } }).status, 409);

    const { value } = validateSuspensionChange({ action: "suspend", reason: " Photos copied from another listing. " }, listing);
    assert.deepEqual(value, { action: "suspend", reason: "Photos copied from another listing.", statusBefore: "published", status: "paused" });
});

test("restoring returns the listing to the status the landlord left it in", () => {
    assert.equal(validateSuspensionChange({ action: "restore" }, { status: "published", moderation: { suspended: false } }).status, 409);

    const restore = (statusBefore) =>
        validateSuspensionChange({ action: "restore" }, { status: "paused", moderation: { suspended: true, statusBefore } }).value.status;
    assert.equal(restore("published"), "published");
    assert.equal(restore("draft"), "draft");
    assert.equal(restore(null), "paused");
});

test("an admin suspension pauses the listing, is audited and tells the landlord", async () => {
    const landlord = id();
    const listing = { _id: id(), title: "Flat", status: "published", landlord, moderation: { suspended: false } };
    mock.method(Property, "findOne", () => ({ select: async () => listing }));
    const update = mock.method(Property, "findOneAndUpdate", () => ({
        select: async () => ({ ...listing, status: "paused", moderation: { suspended: true, reason: "Duplicate photos." } }),
    }));
    mock.method(AdminAuditLog, "findOne", () => ({ sort: () => ({ select: () => lean(null) }) }));
    const audited = mock.method(AdminAuditLog, "create", async (doc) => doc);
    const notified = mock.method(Notification, "create", async (doc) => doc);

    const res = await run(changeListingSuspension, {
        params: { propertyId: String(listing._id) },
        body: { action: "suspend", reason: "Duplicate photos." },
        neveUser: { _id: id(), role: "admin" },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.moderation.suspended, true);
    const [filter, change] = update.mock.calls[0].arguments;
    assert.deepEqual(filter["moderation.suspended"], { $ne: true });
    assert.equal(change.$set.status, "paused");
    assert.equal(change.$set["moderation.statusBefore"], "published");
    assert.equal(audited.mock.calls[0].arguments[0].action, "listing_suspended");
    const doc = notified.mock.calls[0].arguments[0];
    assert.equal(doc.type, "listing_suspension_changed");
    assert.equal(String(doc.recipient), String(landlord));
});

test("a landlord can't republish a suspended listing", async () => {
    const listing = { _id: id(), status: "paused", moderation: { suspended: true }, save: mock.fn() };
    mock.method(Property, "findOne", async () => listing);

    const res = await run(updatePropertyStatus, {
        params: { id: String(listing._id) },
        body: { status: "published" },
        neveUser: { _id: id(), role: "landlord" },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(listing.save.mock.callCount(), 0);
});
