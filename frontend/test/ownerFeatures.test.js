import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import Inquiry from "../src/server/models/Inquiry.js";
import Property from "../src/server/models/Property.js";
import Review from "../src/server/models/Review.js";
import SavedProperty from "../src/server/models/SavedProperty.js";
import TenancyAgreement from "../src/server/models/TenancyAgreement.js";
import User from "../src/server/models/User.js";
import ViewingRequest from "../src/server/models/ViewingRequest.js";
import { deleteProperty } from "../src/server/controllers/property.controller.js";
import { deleteReviewReply, upsertReviewReply } from "../src/server/controllers/review.controller.js";

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();

function response() {
    return {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

async function run(handler, req) {
    const res = response();
    let failure = null;
    await handler(req, res, (err) => {
        failure = err;
    });
    if (failure) throw failure;
    return res;
}

function chain(value) {
    return { select: async () => value };
}

test("deleting a listing with active tenancy records is blocked", async () => {
    const property = { _id: id(), title: "Flat", save: mock.fn(async () => {}) };
    mock.method(Property, "findOne", async () => property);
    mock.method(TenancyAgreement, "countDocuments", async () => 1);

    const res = await run(deleteProperty, { params: { id: String(property._id) }, neveUser: { _id: id() } });

    assert.equal(res.statusCode, 409);
    assert.equal(property.save.mock.callCount(), 0);
});

test("deleting a listing soft-deletes it and cleans up renter-facing data", async () => {
    const property = { _id: id(), title: "Flat", status: "published", save: mock.fn(async () => {}) };
    const viewing = { _id: id(), renter: id() };
    mock.method(Property, "findOne", async () => property);
    mock.method(TenancyAgreement, "countDocuments", async () => 0);
    mock.method(ViewingRequest, "find", () => chain([viewing]));
    const viewingUpdate = mock.method(ViewingRequest, "updateMany", async () => ({}));
    const inquiryUpdate = mock.method(Inquiry, "updateMany", async () => ({}));
    const savedDelete = mock.method(SavedProperty, "deleteMany", async () => ({}));
    const savedBy = id();
    mock.method(SavedProperty, "find", () => ({ distinct: async () => [savedBy] }));
    mock.method(User, "find", () => ({ distinct: async () => [savedBy] }));
    mock.method(User, "updateMany", async () => ({}));
    const { default: Notification } = await import("../src/server/models/Notification.js");
    const created = mock.method(Notification, "create", async (doc) => doc);

    const res = await run(deleteProperty, { params: { id: String(property._id) }, neveUser: { _id: id() } });

    assert.equal(res.statusCode, 200);
    assert.equal(property.status, "deleted");
    assert.ok(property.deletedAt instanceof Date);
    assert.equal(res.body.cancelledViewings, 1);
    assert.deepEqual(viewingUpdate.mock.calls[0].arguments[1], { $set: { status: "cancelled" } });
    assert.deepEqual(inquiryUpdate.mock.calls[0].arguments[1], { $set: { status: "closed" } });
    assert.equal(savedDelete.mock.callCount(), 1);

    const sent = created.mock.calls.map((call) => call.arguments[0]);
    // One notice per renter who saved it, even when both saved lists have them.
    const favourite = sent.filter((doc) => doc.type === "favorite_property_changed");
    assert.equal(favourite.length, 1);
    assert.equal(String(favourite[0].recipient), String(savedBy));
    assert.match(favourite[0].message, /No longer listed/);
    assert.ok(sent.some((doc) => doc.type === "viewing_request_cancelled" && String(doc.recipient) === String(viewing.renter)));
});

test("deleted is a valid property status", () => {
    assert.ok(Property.schema.path("status").enumValues.includes("deleted"));
});

test("only the property's landlord can reply to a review", async () => {
    const review = { _id: id(), property: id(), landlordReply: null, save: mock.fn(async () => {}) };
    mock.method(Review, "findOne", async () => review);
    mock.method(Property, "exists", async () => null);

    const res = await run(upsertReviewReply, {
        params: { reviewId: String(review._id) },
        body: { text: "Thanks for visiting!" },
        neveUser: { _id: id() },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(review.save.mock.callCount(), 0);
});

test("landlord can post, edit and delete a reply", async () => {
    const landlord = id();
    const review = { _id: id(), property: id(), landlordReply: null, save: mock.fn(async () => {}) };
    mock.method(Review, "findOne", async () => review);
    mock.method(Property, "exists", async () => ({ _id: review.property }));
    const req = (text) => ({ params: { reviewId: String(review._id) }, body: { text }, neveUser: { _id: landlord } });

    const created = await run(upsertReviewReply, req("  Thanks for visiting!  "));
    assert.equal(created.statusCode, 201);
    assert.equal(review.landlordReply.text, "Thanks for visiting!");
    assert.equal(review.landlordReply.editedAt, null);

    const edited = await run(upsertReviewReply, req("Updated reply"));
    assert.equal(edited.statusCode, 200);
    assert.equal(review.landlordReply.text, "Updated reply");
    assert.ok(review.landlordReply.editedAt instanceof Date);

    assert.equal((await run(upsertReviewReply, req("x"))).statusCode, 400);

    const removed = await run(deleteReviewReply, req());
    assert.equal(removed.statusCode, 200);
    assert.equal(review.landlordReply, null);
});
