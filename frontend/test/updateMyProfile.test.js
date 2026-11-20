import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import User from "../src/server/models/User.js";
import Property from "../src/server/models/Property.js";
import PlatformSetting from "../src/server/models/PlatformSetting.js";
import { clearSettingsCache } from "../src/server/services/platformSettings.service.js";
import { updateMyProfile } from "../src/server/controllers/user.controller.js";

afterEach(() => mock.restoreAll());

function fakeUser(fields) {
    return { _id: "u1", displayName: "Old", phoneNumber: null, save: mock.fn(async () => {}), ...fields };
}

async function call(user, body, publishedListings = 0) {
    mock.method(User, "findOne", async () => user);
    mock.method(Property, "countDocuments", async () => publishedListings);
    const res = {
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
    let nextError = null;
    await updateMyProfile({ user: { uid: "firebase-1", signInProvider: "password" }, body }, res, (err) => {
        nextError = err;
    });
    if (nextError) throw nextError;
    return res;
}

test("updates display name and phone number", async () => {
    const user = fakeUser({ role: "landlord" });
    const res = await call(user, { displayName: "  Fairuz  ", phoneNumber: "+880 1711-123456" });

    assert.equal(res.statusCode, 200);
    assert.equal(user.displayName, "Fairuz");
    assert.equal(user.phoneNumber, "+880 1711-123456");
    assert.equal(user.save.mock.callCount(), 1);
});

test("rejects invalid phone numbers and unknown fields", async () => {
    assert.equal((await call(fakeUser({ role: "renter" }), { phoneNumber: "call me" })).statusCode, 400);
    assert.equal((await call(fakeUser({ role: "renter" }), { email: "x@y.z" })).statusCode, 400);
});

test("renter can switch to landlord", async () => {
    clearSettingsCache();
    mock.method(PlatformSetting, "findById", () => ({ lean: async () => null }));
    const user = fakeUser({ role: "renter" });
    const res = await call(user, { role: "landlord" });

    assert.equal(res.statusCode, 200);
    assert.equal(user.role, "landlord");
});

test("switching to landlord is refused while landlord sign-ups are paused", async () => {
    clearSettingsCache();
    mock.method(PlatformSetting, "findById", () => ({ lean: async () => ({ landlordSignupsOpen: false }) }));
    const user = fakeUser({ role: "renter" });
    const res = await call(user, { role: "landlord" });

    assert.equal(res.statusCode, 403);
    assert.equal(user.role, "renter");
    clearSettingsCache();
});

test("landlord with published listings cannot switch to renter", async () => {
    const user = fakeUser({ role: "landlord" });
    const res = await call(user, { role: "renter" }, 2);

    assert.equal(res.statusCode, 409);
    assert.equal(user.role, "landlord");
    assert.equal(user.save.mock.callCount(), 0);
});

test("users cannot self-assign staff roles, and staff cannot switch", async () => {
    assert.equal((await call(fakeUser({ role: "renter" }), { role: "admin" })).statusCode, 400);
    const admin = fakeUser({ role: "admin" });
    assert.equal((await call(admin, { role: "renter" })).statusCode, 403);
    assert.equal(admin.role, "admin");
});
