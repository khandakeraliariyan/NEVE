import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import { createProperty, updateProperty } from "../src/server/controllers/property.controller.js";
import Property from "../src/server/models/Property.js";

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

test("creating a listing ignores photo IDs and ownership fields in the body", async () => {
    const created = mock.method(Property, "create", async (doc) => doc);
    const landlord = id();
    const otherFile = id();

    const res = await run(createProperty, {
        neveUser: { _id: landlord },
        body: { title: "Flat", images: [otherFile], landlord: id(), status: "published" },
    });

    assert.equal(res.statusCode, 201);
    const doc = created.mock.calls[0].arguments[0];
    assert.equal(doc.title, "Flat");
    assert.equal(doc.images, undefined);
    assert.equal(doc.landlord, landlord);
    assert.equal(doc.status, "draft");
});

test("updating a listing can't swap in photo IDs, and an empty body is a 400", async () => {
    const listing = { _id: id(), status: "draft", save: mock.fn(async () => {}) };
    mock.method(Property, "findOne", async () => listing);

    const onlyImages = await run(updateProperty, {
        neveUser: { _id: id() },
        params: { id: String(listing._id) },
        body: { images: [id()] },
    });
    assert.equal(onlyImages.statusCode, 400);
    assert.equal(listing.images, undefined);

    const noBody = await run(updateProperty, {
        neveUser: { _id: id() },
        params: { id: String(listing._id) },
        body: undefined,
    });
    assert.equal(noBody.statusCode, 400);
    assert.equal(listing.save.mock.callCount(), 0);
});
