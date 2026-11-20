import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import Notification from "../src/server/models/Notification.js";
import User from "../src/server/models/User.js";
import {
    notifyAIEvaluationRecorded,
    notifyCitationReviewRequested,
    notifyLegalSourceDecided,
    notifyLegalSourcePublished,
} from "../src/server/services/notificationEvents.service.js";
import { NOTIFICATION_TYPES, defaultNotificationLink } from "../src/server/services/notificationTypes.js";

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();
const source = (extra = {}) => ({ _id: id(), title: "Premises Rent Control Act", citation: "Act III of 1991", version: 2, jurisdiction: "Bangladesh", ...extra });

function usersByRole(map) {
    mock.method(User, "find", (filter) => ({ distinct: async () => map[filter.role] ?? [] }));
}

test("the new reviewer notification types are registered with links", () => {
    for (const type of ["legal_source_decided", "legal_source_published", "citation_review_requested", "ai_evaluation_recorded"]) {
        assert.ok(NOTIFICATION_TYPES.includes(type), type);
        assert.notEqual(defaultNotificationLink({ type }), "/notifications", type);
    }
});

test("the author hears a reviewer's decision, but not their own", async () => {
    const author = id();
    const reviewer = id();
    const created = mock.method(Notification, "create", async (doc) => doc);

    await notifyLegalSourceDecided({ source: source({ createdBy: author }), action: "request_changes", note: "Section 5 text is incomplete.", actorId: reviewer });
    const doc = created.mock.calls[0].arguments[0];
    assert.equal(String(doc.recipient), String(author));
    assert.equal(doc.type, "legal_source_decided");
    assert.match(doc.message, /needs changes/);
    assert.match(doc.message, /Section 5 text is incomplete/);

    await notifyLegalSourceDecided({ source: source({ createdBy: reviewer }), action: "approve", actorId: reviewer });
    await notifyLegalSourceDecided({ source: source({ createdBy: author }), action: "submit", actorId: reviewer });
    assert.equal(created.mock.callCount(), 1);
});

test("publishing a version tells other reviewers and admins once each", async () => {
    const actor = id();
    const otherReviewer = id();
    const admin = id();
    usersByRole({ legal_reviewer: [actor, otherReviewer], admin: [admin] });
    const created = mock.method(Notification, "create", async (doc) => doc);

    await notifyLegalSourcePublished({ source: source(), replacedVersions: 1, actorId: actor });
    const recipients = created.mock.calls.map((call) => String(call.arguments[0].recipient)).sort();
    assert.deepEqual(recipients, [String(otherReviewer), String(admin)].sort());
    assert.match(created.mock.calls[0].arguments[0].message, /replaces the previously approved version/);
});

test("citation review requests summarise what is affected and skip when nothing is", async () => {
    const reviewer = id();
    usersByRole({ legal_reviewer: [reviewer] });
    const created = mock.method(Notification, "create", async (doc) => doc);

    await notifyCitationReviewRequested({ source: source(), affectedAnswers: 0, affectedAgreements: 0 });
    assert.equal(created.mock.callCount(), 0);

    await notifyCitationReviewRequested({ source: source(), affectedAnswers: 3, affectedAgreements: 1 });
    const doc = created.mock.calls[0].arguments[0];
    assert.equal(doc.type, "citation_review_requested");
    assert.match(doc.message, /3 Legal Copilot answers and 1 agreement cite/);
});

test("evaluation runs are announced with headline scores and role-specific links", async () => {
    const reviewer = id();
    const admin = id();
    const submitter = id();
    usersByRole({ legal_reviewer: [reviewer], admin: [admin, submitter] });
    const created = mock.method(Notification, "create", async (doc) => doc);
    const run = { _id: id(), task: "legal_citation", datasetName: "bd-tenancy", caseCount: 40, status: "completed", f1: 0.8765, exactMatchRate: null };

    await notifyAIEvaluationRecorded({ run, actorId: submitter });
    const docs = created.mock.calls.map((call) => call.arguments[0]);
    assert.equal(docs.length, 2);
    const byRecipient = Object.fromEntries(docs.map((doc) => [String(doc.recipient), doc]));
    assert.equal(byRecipient[String(reviewer)].link, `/legal-review/ai-evaluations/${run._id}`);
    assert.equal(byRecipient[String(admin)].link, `/admin/ai-evaluations/${run._id}`);
    assert.match(docs[0].title, /legal citation/);
    assert.match(docs[0].message, /F1 87.7%/);
});
