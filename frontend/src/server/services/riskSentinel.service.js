// Risk Sentinel: one place for the open items across a person's agreements:
// contract-risk findings, conflicts between records, and missing records.
// Everything here is computed from stored records and the existing checks.
// An item is a prompt for review: it never says anyone is at fault, and a
// priority is a reading of what is at stake, not a legal conclusion.

export const CONFLICT_REVIEW_STATUSES = ["open", "resolved", "dismissed"];

export const SENTINEL_CATEGORIES = {
    contract: "Contract wording to check",
    listing_agreement: "Listing and agreement differ",
    financial: "Payment records differ",
    records: "Other records differ",
    missing: "Missing records or evidence",
    legal_review: "May need legal review",
};

const FINANCIAL = new Set(["conflicting_payment_records", "payment_amount_mismatch", "disputed_payment"]);

// A stable identity for an analysis flag, so a review survives re-computation.
export function flagKey(flag) {
    const ids = [flag.targetId, flag.relatedId, ...(flag.targetIds ?? [])].filter(Boolean).map(String).sort();
    return [flag.type, flag.field ?? flag.paymentType ?? flag.meterType ?? flag.stage ?? "", flag.month ?? "", ids.join(",")].join("|").slice(0, 300);
}

// Adds key and review state to the analysis's conflicts and missing items.
export function applyFlagReviews(analysis, reviews = []) {
    const byKey = new Map(reviews.map((review) => [review.key, review]));
    const withReview = (flag) => {
        const key = flagKey(flag);
        const review = byKey.get(key);
        return {
            ...flag,
            key,
            review: review
                ? { status: review.status, reason: review.reason, reviewedBy: review.reviewedBy ? String(review.reviewedBy) : null, reviewedAt: review.reviewedAt }
                : { status: "open" },
        };
    };
    return {
        ...analysis,
        potentialConflicts: (analysis.potentialConflicts ?? []).map(withReview),
        missingInformation: (analysis.missingInformation ?? []).map(withReview),
    };
}

export function validateFlagReview(body, analysis) {
    const key = typeof body?.key === "string" ? body.key : "";
    const status = body?.status;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!CONFLICT_REVIEW_STATUSES.includes(status)) return { error: `status must be one of: ${CONFLICT_REVIEW_STATUSES.join(", ")}.` };
    if (status !== "open" && !reason) return { error: "Explain why in reason, for example which record is right or why the difference is expected." };
    if (reason.length > 1000) return { error: "reason must be at most 1000 characters." };
    const flags = [...(analysis.potentialConflicts ?? []), ...(analysis.missingInformation ?? [])];
    const flag = flags.find((item) => flagKey(item) === key);
    if (!flag) return { error: "That flag is no longer raised for this agreement.", status: 404 };
    return { value: { key, status, reason, flagType: flag.type } };
}

// Records a review on the agreement, keeping earlier decisions in history.
export function recordFlagReview(agreement, { key, status, reason, flagType }, actorId, now = new Date()) {
    agreement.conflictReviews ??= [];
    let review = agreement.conflictReviews.find((item) => item.key === key);
    if (!review) {
        agreement.conflictReviews.push({ key, flagType, status, reason, reviewedBy: actorId, reviewedAt: now, history: [] });
        review = agreement.conflictReviews.at(-1);
    } else {
        review.history.push({ status: review.status, reason: review.reason, reviewedBy: review.reviewedBy, reviewedAt: review.reviewedAt });
        if (review.history.length > 20) review.history.splice(0, review.history.length - 20);
        Object.assign(review, { status, reason, reviewedBy: actorId, reviewedAt: now });
    }
    return review;
}

function flagCategory(flag, kind) {
    if (kind === "missing") return "missing";
    if (flag.type === "listing_agreement_mismatch") return "listing_agreement";
    if (FINANCIAL.has(flag.type)) return "financial";
    return "records";
}

const FLAG_PRIORITY = {
    listing_agreement_mismatch: ["medium", "Concerns money the renter pays."],
    conflicting_payment_records: ["high", "The parties' own payment records disagree."],
    payment_amount_mismatch: ["medium", "Concerns money the renter pays."],
    extracted_value_mismatch: ["medium", "The document and the record disagree on a key term."],
    disputed_maintenance: ["medium", "A participant disputes this repair."],
};

// One list of items across agreements. `entries` is
// [{ agreement, riskAnalysis, evidenceAnalysis }], with evidenceAnalysis
// already passed through applyFlagReviews.
export function buildSentinel(entries) {
    const items = [];
    for (const { agreement, riskAnalysis, evidenceAnalysis } of entries) {
        const ref = { agreementId: String(agreement._id), agreementTitle: agreement.title };
        for (const finding of riskAnalysis?.findings ?? []) {
            const status = ["open", "acknowledged"].includes(finding.status) ? "open" : finding.status;
            const needsLegal = finding.legalReferences?.length > 0 && finding.severity === "high";
            items.push({
                ...ref,
                id: `finding:${finding._id}`,
                source: "contract_risk",
                category: needsLegal ? "legal_review" : "contract",
                type: finding.type,
                title: finding.title,
                description: finding.explanation,
                basis: finding.basis ?? "",
                priority: finding.severity,
                priorityReason:
                    needsLegal
                        ? "High priority and linked to an approved legal source, so a legal reviewer may want to look at it."
                        : finding.severity === "high"
                            ? "Money, housing security or the end of the tenancy is at stake."
                            : "Wording that could be read more than one way or is incomplete.",
                method: finding.method,
                status,
                awaitingReview: status === "open" && !(finding.reviewerNotes ?? []).length,
                link: `/agreements/${ref.agreementId}/risks`,
                updatedAt: finding.statusAt ?? riskAnalysis.runAt,
            });
        }
        for (const [kind, flags] of [["conflict", evidenceAnalysis?.potentialConflicts ?? []], ["missing", evidenceAnalysis?.missingInformation ?? []]]) {
            for (const flag of flags) {
                const [priority, priorityReason] = kind === "missing" ? ["low", "A record that would help is missing."] : FLAG_PRIORITY[flag.type] ?? ["medium", "Two records disagree."];
                items.push({
                    ...ref,
                    id: `flag:${flag.key}`,
                    key: flag.key,
                    source: kind === "missing" ? "missing_information" : "evidence_conflict",
                    category: flagCategory(flag, kind),
                    type: flag.type,
                    title: flag.message,
                    description: flag.caveat ?? "",
                    values: flag.values ?? null,
                    priority,
                    priorityReason,
                    method: "rule",
                    status: flag.review?.status ?? "open",
                    reviewReason: flag.review?.reason ?? "",
                    awaitingReview: (flag.review?.status ?? "open") === "open",
                    link: `/agreements/${ref.agreementId}/evidence`,
                    updatedAt: flag.review?.reviewedAt ?? null,
                });
            }
        }
    }
    const open = items.filter((item) => item.status === "open");
    const rank = { high: 0, medium: 1, low: 2 };
    open.sort((a, b) => rank[a.priority] - rank[b.priority]);
    return {
        summary: {
            agreements: entries.length,
            open: open.length,
            highPriority: open.filter((item) => item.priority === "high").length,
            awaitingReview: open.filter((item) => item.awaitingReview).length,
            resolved: items.filter((item) => item.status === "resolved").length,
            dismissed: items.filter((item) => item.status === "dismissed").length,
            byCategory: Object.fromEntries(Object.keys(SENTINEL_CATEGORIES).map((category) => [category, open.filter((item) => item.category === category).length])),
        },
        categories: SENTINEL_CATEGORIES,
        items: [...open, ...items.filter((item) => item.status !== "open")],
    };
}

export const SENTINEL_DISCLAIMER =
    "Items are prompts to check, computed from the records in Neve and automated checks. They don't verify facts, decide who is right, or say anyone acted wrongly. Priority reflects what is at stake (money, housing, ending the tenancy), not a legal conclusion.";
