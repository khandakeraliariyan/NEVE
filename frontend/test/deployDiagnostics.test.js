import assert from "node:assert/strict";
import test from "node:test";

import { diagnoseDatabaseError, diagnoseFirebaseError } from "../src/server/services/deployDiagnostics.service.js";

test("database errors map to a cause and never repeat the message", () => {
    const cases = [
        [{ name: "MongoServerError", code: 18, message: "Authentication failed." }, "authentication_failed"],
        [{ message: "querySrv ENOTFOUND _mongodb._tcp.nowhere.example" }, "cluster_not_found"],
        [{ name: "MongooseServerSelectionError", message: "Server selection timed out after 10000 ms" }, "cannot_reach_cluster"],
        [{ message: "Invalid scheme, expected connection string to start with mongodb://" }, "malformed_uri"],
        [{ message: "something else" }, "unknown"],
    ];
    for (const [error, reason] of cases) {
        const result = diagnoseDatabaseError(error);
        assert.equal(result.reason, reason);
        assert.ok(result.hint.length > 10);
        assert.ok(!("message" in result));
    }
});

test("firebase start-up errors map to a cause", () => {
    assert.equal(diagnoseFirebaseError(new Error("Unexpected token } in JSON at position 4")).reason, "unreadable");
    assert.equal(diagnoseFirebaseError(new Error("Invalid PEM formatted message")).reason, "invalid_key");
    assert.equal(diagnoseFirebaseError(new Error("boom")).reason, "unknown");
});
