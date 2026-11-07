import assert from "node:assert/strict";
import test from "node:test";

import { getMyProfile } from "../src/controllers/user.controller.js";
import { allowRoles, isAdminSessionAllowed } from "../src/middleware/role.middleware.js";
import User from "../src/models/User.js";
import { authenticateUser } from "../src/middleware/auth.middleware.js";
import {
    ADMIN_SIGN_IN_PROVIDER,
    hashPassword,
    isAdminToken,
    signAdminToken,
    verifyPassword,
} from "../src/services/adminAuth.service.js";

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

test("admin sessions are only allowed from the admin portal's password sign-in", () => {
    assert.equal(isAdminSessionAllowed("admin", ADMIN_SIGN_IN_PROVIDER), true);
    // Firebase email/password no longer counts for admins.
    for (const provider of ["password", "google.com", "custom", null, undefined]) {
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
    const req = { user: { uid: "u1", signInProvider: ADMIN_SIGN_IN_PROVIDER } };
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

test("admin passwords are stored as salted scrypt hashes", async () => {
    const first = await hashPassword("correct horse battery");
    const second = await hashPassword("correct horse battery");
    assert.match(first, /^scrypt\$32768\$8\$1\$/);
    assert.notEqual(first, second, "each hash gets its own salt");
    assert.equal(first.includes("correct horse battery"), false);
    assert.equal(await verifyPassword("correct horse battery", first), true);
    assert.equal(await verifyPassword("correct horse batterY", first), false);
    assert.equal(await verifyPassword("anything", null), false);
});

test("an admin JWT authenticates an active admin", async (t) => {
    const admin = { _id: "64b000000000000000000001", firebaseUid: "neve-admin:x", email: "a@neve.test", role: "admin", isActive: true };
    t.mock.method(User, "findById", () => ({ select: () => Promise.resolve(admin) }));
    const token = signAdminToken(admin);
    assert.equal(isAdminToken(token), true);

    const req = { headers: { authorization: `Bearer ${token}` } };
    let nextCalled = false;
    await authenticateUser(req, createResponse(), () => {
        nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(req.user.uid, "neve-admin:x");
    assert.equal(req.user.signInProvider, ADMIN_SIGN_IN_PROVIDER);
});

test("an admin JWT is refused after deactivation, a password change, or tampering", async (t) => {
    const admin = { _id: "64b000000000000000000001", firebaseUid: "neve-admin:x", email: "a@neve.test", role: "admin", isActive: true };
    const token = signAdminToken(admin);
    const cases = [
        [token, { ...admin, isActive: false }],
        [token, { ...admin, passwordChangedAt: new Date(Date.now() + 60_000) }],
        [token, { ...admin, role: "renter" }],
        [token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA"), admin],
    ];
    for (const [bearer, user] of cases) {
        t.mock.method(User, "findById", () => ({ select: () => Promise.resolve(user) }));
        const res = createResponse();
        let nextCalled = false;
        await authenticateUser({ headers: { authorization: `Bearer ${bearer}` } }, res, () => {
            nextCalled = true;
        });
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 401);
        t.mock.restoreAll();
    }
});
