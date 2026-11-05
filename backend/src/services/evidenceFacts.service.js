// Fact states for Evidence Graph records, and checks on record-to-record
// "requires" links. These describe what is documented; they never decide who
// is right.

const idOf = (value) => (value == null ? null : String(value._id ?? value));

// A "supports" file link confirmed by both the renter and the landlord.
export function isDocumentedFactLink(link, agreement) {
    if (link.relationship !== "supports") return false;
    const confirmers = new Set((link.confirmations ?? []).map((entry) => idOf(entry.user)));
    return confirmers.has(idOf(agreement.renter)) && confirmers.has(idOf(agreement.landlord));
}

export function findRecord(agreement, type, id) {
    const key = String(id);
    if (type === "agreement") return String(agreement._id) === key ? agreement : null;
    const list =
        type === "clause"
            ? agreement.clauses
            : type === "obligation"
              ? agreement.obligations
              : type === "payment"
                ? agreement.payments
                : [];
    return (list ?? []).find((item) => String(item._id) === key) ?? null;
}

// One state per clause, obligation and payment:
// - documented: a both-party-confirmed supporting file, and nothing disputes it
// - disputed: marked disputed, or a contradicting file or record link
// - uncertain: supporting evidence exists but isn't confirmed by both parties
// - undocumented: no supporting evidence linked
export function buildFactStates(agreement, links = [], recordLinks = []) {
    const records = [
        ...(agreement.clauses ?? [])
            .filter((clause) => (clause.reviewStatus ?? "confirmed") !== "rejected")
            .map((clause) => ({ type: "clause", record: clause })),
        ...(agreement.obligations ?? []).map((obligation) => ({ type: "obligation", record: obligation })),
        ...(agreement.payments ?? []).map((payment) => ({ type: "payment", record: payment })),
    ];

    return records.map(({ type, record }) => {
        const id = String(record._id);
        const fileLinks = links.filter((link) => String(link.targetId) === id);
        const incoming = recordLinks.filter((link) => String(link.toId) === id || String(link.fromId) === id);
        const documentedBy = fileLinks.filter((link) => isDocumentedFactLink(link, agreement));
        const supporting = fileLinks.filter((link) => link.relationship === "supports");
        const contradicted =
            record.status === "disputed" ||
            fileLinks.some((link) => link.relationship === "contradicts") ||
            incoming.some((link) => link.relationship === "contradicts");

        let state = "undocumented";
        if (contradicted) state = "disputed";
        else if (documentedBy.length) state = "documented";
        else if (supporting.length || (type === "payment" && record.receiptFile)) state = "uncertain";

        return {
            targetType: type,
            targetId: id,
            state,
            documentedByLinkIds: documentedBy.map((link) => String(link._id)),
        };
    });
}

// "A requires B" is unmet when B no longer exists, or B is an obligation that
// isn't completed.
export function findUnmetRequirements(agreement, recordLinks = []) {
    const flags = [];
    for (const link of recordLinks) {
        if (link.relationship !== "requires" || link.toType === "legal_section") continue;
        const required = findRecord(agreement, link.toType, link.toId);
        if (!required) {
            flags.push({
                type: "missing_required_record",
                linkId: String(link._id),
                targetId: String(link.fromId),
                requiredType: link.toType,
                requiredId: String(link.toId),
                message: `A required ${link.toType} record is no longer in this agreement.`,
            });
        } else if (link.toType === "obligation" && required.status !== "completed") {
            flags.push({
                type: "unmet_requirement",
                linkId: String(link._id),
                targetId: String(link.fromId),
                requiredType: link.toType,
                requiredId: String(link.toId),
                message: `A required obligation is ${required.status}, not completed.`,
            });
        }
    }
    return flags;
}

export function validateRecordLinkInput(body, agreement, { nodeTypes, relationships }) {
    const { fromType, fromId, toType, toId, relationship, explanation = "" } = body ?? {};
    if (!nodeTypes.includes(fromType) || !nodeTypes.includes(toType)) {
        return { error: `fromType and toType must be one of: ${nodeTypes.join(", ")}.`, status: 400 };
    }
    if (!relationships.includes(relationship)) {
        return { error: `relationship must be one of: ${relationships.join(", ")}.`, status: 400 };
    }
    if (typeof explanation !== "string" || explanation.length > 1000) {
        return { error: "explanation must be at most 1000 characters.", status: 400 };
    }
    if (String(fromId) === String(toId)) {
        return { error: "A record can't be linked to itself.", status: 400 };
    }
    if (!findRecord(agreement, fromType, fromId) || !findRecord(agreement, toType, toId)) {
        return { error: "Both records must belong to this agreement.", status: 404 };
    }
    return {
        value: {
            fromType,
            fromId: String(fromId),
            toType,
            toId: String(toId),
            relationship,
            explanation: explanation.trim(),
        },
    };
}
