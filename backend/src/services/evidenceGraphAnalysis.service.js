import { findMeterReadingIssues, findPaymentConflicts } from "./evidenceChecks.service.js";
import { buildFactStates, findUnmetRequirements } from "./evidenceFacts.service.js";

// Compares values extracted from the agreement file with the values a
// participant recorded. A mismatch is a conflict to review, not a finding of
// which value is right.
export function findExtractionMismatches(agreement) {
    const extraction = agreement.extraction;
    if (!extraction || extraction.status !== "completed" || !extraction.facts) {
        return [];
    }

    const day = (value) => new Date(value).toISOString().slice(0, 10);
    const fields = [
        ["startAt", day],
        ["endAt", day],
        ["monthlyRentBdt", Number],
        ["depositBdt", Number],
        ["advanceRentBdt", Number],
    ];

    const mismatches = [];
    for (const [field, normalize] of fields) {
        const fact = extraction.facts[field];
        const extracted = fact?.value;
        const recorded = agreement[field];
        if (extracted == null || recorded == null) {
            continue;
        }
        if (normalize(extracted) !== normalize(recorded)) {
            mismatches.push({
                field,
                recordedValue: recorded,
                extractedValue: extracted,
                sourceText: fact.sourceText ?? "",
                sourcePage: fact.sourcePage ?? null,
            });
        }
    }

    return mismatches;
}

export function analyzeAgreementEvidence(agreement, allLinks, recordLinks = [], conditionReports = []) {
    // AI proposals count only once a participant accepts them.
    const links = allLinks.filter((link) => (link.reviewStatus ?? "accepted") === "accepted");
    const proposedLinks = allLinks.filter((link) => link.reviewStatus === "proposed");
    const missingInformation = [];
    const potentialConflicts = [];
    const uncertainInterpretations = [];

    for (const field of [
        ["startAt", "Agreement start date is not recorded."],
        ["endAt", "Agreement end date is not recorded."],
        ["monthlyRentBdt", "Monthly rent is not recorded in agreement metadata."],
        ["depositBdt", "Deposit amount is not recorded in agreement metadata."],
    ]) {
        if (agreement[field[0]] == null) {
            missingInformation.push({
                type: "agreement_metadata",
                field: field[0],
                message: field[1],
            });
        }
    }

    const clauses = agreement.clauses ?? [];
    const activeClauses = clauses.filter(
        (clause) => (clause.reviewStatus ?? "confirmed") === "confirmed"
    );
    const proposedClauses = clauses.filter(
        (clause) => clause.reviewStatus === "proposed"
    );

    if (activeClauses.length === 0) {
        missingInformation.push({
            type: "clause_annotations",
            message:
                proposedClauses.length > 0
                    ? "No clauses have been confirmed yet; extracted clauses are awaiting participant review."
                    : "No clauses have been annotated or extracted.",
        });
    }

    for (const clause of proposedClauses) {
        uncertainInterpretations.push({
            type: "unreviewed_extracted_clause",
            targetId: String(clause._id),
            message:
                "This clause was extracted automatically and has not been confirmed by a participant.",
        });
    }

    for (const clause of activeClauses) {
        if (clause.sourceVerified === false) {
            uncertainInterpretations.push({
                type: "unverified_clause_quote",
                targetId: String(clause._id),
                message:
                    "This clause's quote was not found word-for-word in the agreement text.",
            });
        }
        if (clause.ambiguityNote) {
            uncertainInterpretations.push({
                type: "ambiguous_clause",
                targetId: String(clause._id),
                message: clause.ambiguityNote,
            });
        }
    }

    for (const mismatch of findExtractionMismatches(agreement)) {
        potentialConflicts.push({
            type: "extracted_value_mismatch",
            field: mismatch.field,
            recordedValue: mismatch.recordedValue,
            extractedValue: mismatch.extractedValue,
            sourceText: mismatch.sourceText,
            sourcePage: mismatch.sourcePage,
            message: `The recorded ${mismatch.field} differs from the value extracted from the agreement file.`,
        });
    }

    for (const obligation of agreement.obligations) {
        if (!obligation.evidenceFile) {
            missingInformation.push({
                type: "obligation_evidence",
                targetId: String(obligation._id),
                message: "No evidence file is linked to this obligation.",
            });
        }
        if (obligation.status === "disputed") {
            potentialConflicts.push({
                type: "disputed_obligation",
                targetId: String(obligation._id),
                message: "A participant marked this obligation as disputed.",
            });
        }
    }

    for (const payment of agreement.payments) {
        if (!payment.receiptFile) {
            missingInformation.push({
                type: "payment_receipt",
                targetId: String(payment._id),
                message: "No receipt file is linked to this payment record.",
            });
        }
        if (payment.status === "disputed") {
            potentialConflicts.push({
                type: "disputed_payment",
                targetId: String(payment._id),
                message: "A participant marked this payment record as disputed.",
            });
        }
    }

    for (const link of links) {
        const targetId = String(link.targetId);
        if (link.relationship === "contradicts") {
            potentialConflicts.push({
                type: "user_marked_contradiction",
                linkId: String(link._id),
                targetId,
                message: "A participant marked this evidence relationship as contradicting.",
            });
        }
        if (
            link.relationship === "unassessed" ||
            (link.confidence !== null &&
                link.confidence !== undefined &&
                link.confidence < 0.5)
        ) {
            uncertainInterpretations.push({
                linkId: String(link._id),
                targetId,
                relationship: link.relationship,
                confidence: link.confidence ?? null,
                message:
                    link.relationship === "unassessed"
                        ? "This evidence relationship has not been assessed."
                        : "A participant recorded low confidence in this relationship.",
            });
        }
    }

    missingInformation.push(...findUnmetRequirements(agreement, recordLinks));
    potentialConflicts.push(...findPaymentConflicts(agreement));
    const meterIssues = findMeterReadingIssues(conditionReports);
    missingInformation.push(...meterIssues.missing);
    potentialConflicts.push(...meterIssues.conflicts);
    for (const link of recordLinks) {
        if (link.relationship === "contradicts") {
            potentialConflicts.push({
                type: "record_contradiction",
                linkId: String(link._id),
                targetId: String(link.fromId),
                relatedId: String(link.toId),
                message: `A participant marked this ${link.fromType} as contradicting a ${link.toType}.`,
            });
        }
    }

    for (const link of proposedLinks) {
        uncertainInterpretations.push({
            type: "unreviewed_ai_link",
            linkId: String(link._id),
            targetId: String(link.targetId),
            relationship: link.relationship,
            confidence: link.confidence ?? null,
            message: "This link was suggested automatically and has not been accepted by a participant.",
        });
    }

    const factStates = buildFactStates(agreement, links, recordLinks);

    return {
        method: "deterministic_record_completeness_and_user_assessments",
        missingInformation,
        potentialConflicts,
        uncertainInterpretations,
        factStates,
        documentedFacts: factStates.filter((fact) => fact.state === "documented"),
        disclaimer:
            "These flags reflect recorded fields, participant assessments, and any automated extraction of the agreement file. Extracted clauses are proposals until a participant confirms them. Flags do not verify facts or determine legal liability.",
    };
}
