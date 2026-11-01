export function analyzeAgreementEvidence(agreement, links) {
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

    if (agreement.clauses.length === 0) {
        missingInformation.push({
            type: "clause_annotations",
            message: "No clauses have been manually annotated.",
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

    return {
        method: "deterministic_record_completeness_and_user_assessments",
        missingInformation,
        potentialConflicts,
        uncertainInterpretations,
        disclaimer:
            "These flags reflect recorded fields and participant assessments only. Files are not analyzed, and flags do not verify facts or determine legal liability.",
    };
}
