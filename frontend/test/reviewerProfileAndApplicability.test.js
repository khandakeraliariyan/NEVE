import assert from "node:assert/strict";
import test from "node:test";

import LegalSource from "../src/server/models/LegalSource.js";
import { normalizeQualifications, validateProfileFields } from "../src/server/services/profile.service.js";
import { validateApplicability, validateLegalSourceInput } from "../src/server/services/legalSource.service.js";

test("legal reviewers can record professional qualifications", () => {
    const { updates, error } = validateProfileFields(
        { reviewerProfile: { qualifications: [{ title: " LLB ", institution: "University of Dhaka", year: 2015 }, { title: "LLM" }] } },
        "legal_reviewer"
    );
    assert.equal(error, undefined);
    assert.deepEqual(updates["profile.reviewer.qualifications"], [
        { title: "LLB", institution: "University of Dhaka", year: 2015 },
        { title: "LLM", institution: "", year: null },
    ]);

    assert.ok(validateProfileFields({ reviewerProfile: { qualifications: [] } }, "renter").error);
    assert.ok(normalizeQualifications([{ institution: "No title" }]).error);
    assert.ok(normalizeQualifications([{ title: "LLB", year: 1800 }]).error);
    assert.ok(normalizeQualifications([{ title: "LLB", grade: "A" }]).error);
    assert.ok(normalizeQualifications(Array.from({ length: 11 }, () => ({ title: "x" }))).error);
});

test("legal sources accept and validate applicability information", () => {
    const { value, error } = validateLegalSourceInput(
        {
            applicability: {
                summary: "Covers residential premises let for rent.",
                appliesTo: ["residential", "shared_accommodation", "residential"],
                regions: [" Dhaka "],
                exclusions: "Government-owned housing",
            },
        },
        { partial: true }
    );
    assert.equal(error, undefined);
    assert.deepEqual(value.applicability, {
        summary: "Covers residential premises let for rent.",
        appliesTo: ["residential", "shared_accommodation"],
        regions: ["Dhaka"],
        exclusions: "Government-owned housing",
    });

    assert.ok(validateApplicability({ appliesTo: ["spaceships"] }).error);
    assert.ok(validateApplicability({ unknown: true }).error);
    assert.ok(validateApplicability("residential").error);

    const source = new LegalSource({ applicability: value.applicability });
    assert.deepEqual(source.applicability.appliesTo, ["residential", "shared_accommodation"]);
    assert.equal(source.validateSync()?.errors?.["applicability.appliesTo.0"], undefined);
});
