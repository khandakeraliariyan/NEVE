import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import User from "../src/server/models/User.js";
import UploadedFile from "../src/server/models/UploadedFile.js";
import {
    buildProfilePhotoUrl,
    removeMyProfilePhoto,
    setMyProfilePhoto,
} from "../src/server/controllers/profilePhoto.controller.js";

afterEach(() => mock.restoreAll());

function makeRes() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

const req = (body) => ({ user: { uid: "f1", signInProvider: "password" }, body });

test("sets a confirmed profile_photo upload as the photo", async () => {
    const user = { _id: "507f1f77bcf86cd799439011", role: "renter", isActive: true, save: mock.fn(async () => {}) };
    mock.method(User, "findOne", async () => user);
    let query;
    mock.method(UploadedFile, "findOne", (q) => { query = q; return { select: async () => ({ _id: "file1" }) }; });

    const res = makeRes();
    await setMyProfilePhoto(req({ fileId: "507f1f77bcf86cd799439012" }), res, (e) => { throw e; });

    assert.equal(res.statusCode, 200);
    assert.equal(query.purpose, "profile_photo");
    assert.equal(query.uploadedBy, user._id);
    assert.equal(user.profilePhoto, "file1");
    assert.equal(user.photoURL, buildProfilePhotoUrl(user._id));
});

test("rejects a file that isn't the user's confirmed photo upload", async () => {
    mock.method(User, "findOne", async () => ({ _id: "u1", role: "renter", isActive: true }));
    mock.method(UploadedFile, "findOne", () => ({ select: async () => null }));
    const res = makeRes();
    await setMyProfilePhoto(req({ fileId: "507f1f77bcf86cd799439012" }), res, (e) => { throw e; });
    assert.equal(res.statusCode, 404);
});

test("rejects an invalid file ID", async () => {
    mock.method(User, "findOne", async () => ({ _id: "u1", role: "renter", isActive: true }));
    const res = makeRes();
    await setMyProfilePhoto(req({ fileId: "nope" }), res, (e) => { throw e; });
    assert.equal(res.statusCode, 400);
});

test("removes the photo", async () => {
    const user = { _id: "u1", role: "renter", isActive: true, profilePhoto: "f", photoURL: "x", save: mock.fn(async () => {}) };
    mock.method(User, "findOne", async () => user);
    const res = makeRes();
    await removeMyProfilePhoto(req({}), res, (e) => { throw e; });
    assert.equal(user.profilePhoto, null);
    assert.equal(user.photoURL, null);
});
