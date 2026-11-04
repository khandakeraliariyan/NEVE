import assert from "node:assert/strict";
import test from "node:test";

import { getMyProfile } from "../src/controllers/user.controller.js";
import { allowRoles, isAdminSessionAllowed } from "../src/middleware/role.middleware.js";
import User from "../src/models/User.js";

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

function mockFindOne(t, user) {
    const query = Promise.resolve(user);
    query.select = () => Promise.resolve(user);
    t.mock.method(User, "findOne", () => query);
}

test("admin sessions are only allowed from email and password sign-in", () => {
    assert.equal(isAdminSessionAllowed("admin", "password"), true);
    for (const provider of ["google.com", "custom", null, undefined]) {
        assert.equal(isAdminSessionAllowed("admin", provider), false);
    }
    for (const role of ["renter", "landlord", "legal_reviewer"]) {
        assert.equal(isAdminSessionAllowed(role, "google.com"), true);
    }
});

test("admin routes refuse an admin signed in with Google", async (t) => {
    mockFindOne(t, { role: "admin", isActive: true });
    const res = createResponse();
    let nextCalled = false;
    await allowRoles("admin")({ user: { uid: "u1", signInProvider: "google.com" } }, res, () => {
        nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, "ADMIN_PASSWORD_SIGN_IN_REQUIRED");
});

test("admin routes accept an admin signed in with a password", async (t) => {
    const admin = { role: "admin", isActive: true };
    mockFindOne(t, admin);
    const req = { user: { uid: "u1", signInProvider: "password" } };
    let nextCalled = false;
    await allowRoles("admin")(req, createResponse(), () => {
        nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(req.neveUser, admin);
});

test("the profile endpoint refuses an admin's Google session", async (t) => {
    mockFindOne(t, { role: "admin", isActive: true });
    const res = createResponse();
    await getMyProfile({ user: { uid: "u1", signInProvider: "google.com" } }, res, (error) => {
        throw error;
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, "ADMIN_PASSWORD_SIGN_IN_REQUIRED");
});

test("renters keep using Google sign-in", async (t) => {
    mockFindOne(t, { role: "renter", isActive: true });
    const res = createResponse();
    await getMyProfile({ user: { uid: "u1", signInProvider: "google.com" } }, res, (error) => {
        throw error;
    });
    assert.equal(res.statusCode, 200);
});
