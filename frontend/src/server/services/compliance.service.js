// ComplianceOS: obligation states, recurring obligations and compliance
// summaries. Everything here is computed from what the parties recorded;
// Neve doesn't verify that an obligation was really met.

export const OBLIGATION_CATEGORIES = ["payment", "maintenance", "notice", "property", "other"];
export const RECURRENCE_FREQUENCIES = ["none", "weekly", "monthly", "quarterly", "yearly"];
export const DUE_SOON_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

// The next due date after `from` for a recurring obligation. Monthly dates
// keep the day of the month where possible (31 Jan -> 28/29 Feb).
export function nextDueDate(from, frequency) {
    if (!from || !frequency || frequency === "none") return null;
    const date = new Date(from);
    if (frequency === "weekly") return new Date(date.getTime() + 7 * DAY);
    const months = { monthly: 1, quarterly: 3, yearly: 12 }[frequency];
    if (!months) return null;
    const day = date.getUTCDate();
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, date.getUTCHours(), date.getUTCMinutes()));
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
    return next;
}

export function isRecurring(obligation) {
    return Boolean(obligation?.recurrence?.frequency && obligation.recurrence.frequency !== "none");
}

// overdue | due_soon | upcoming | no_date | completed | disputed
export function obligationState(obligation, now = new Date()) {
    if (obligation.status === "completed") return "completed";
    if (obligation.status === "disputed") return "disputed";
    if (!obligation.dueAt) return "no_date";
    const due = new Date(obligation.dueAt).getTime();
    if (due < now.getTime()) return "overdue";
    if (due - now.getTime() <= DUE_SOON_DAYS * DAY) return "due_soon";
    return "upcoming";
}

export function daysOverdue(obligation, now = new Date()) {
    if (obligationState(obligation, now) !== "overdue") return 0;
    return Math.floor((now.getTime() - new Date(obligation.dueAt).getTime()) / DAY);
}

// Marks an obligation completed. A recurring one records the completion and
// moves to its next due date instead, unless the series has ended.
export function completeObligation(obligation, { actor, now = new Date(), evidenceFile = null, note = "" }) {
    obligation.completions = obligation.completions ?? [];
    obligation.completions.push({ dueAt: obligation.dueAt ?? null, completedAt: now, by: actor, evidenceFile, note });
    if (obligation.completions.length > 120) obligation.completions.splice(0, obligation.completions.length - 120);
    if (evidenceFile) obligation.evidenceFile = evidenceFile;
    const next = isRecurring(obligation) ? nextDueDate(obligation.dueAt ?? now, obligation.recurrence.frequency) : null;
    const until = obligation.recurrence?.until ? new Date(obligation.recurrence.until) : null;
    if (next && (!until || next <= until)) {
        obligation.dueAt = next;
        obligation.status = "open";
        obligation.dueReminderFor = null;
        obligation.overdueNotifiedFor = null;
        return { recurring: true, nextDueAt: next };
    }
    obligation.status = "completed";
    return { recurring: false, nextDueAt: null };
}

export function validateObligationExtras(body = {}) {
    const value = {};
    if (body.category !== undefined) {
        if (!OBLIGATION_CATEGORIES.includes(body.category)) return { error: `category must be one of: ${OBLIGATION_CATEGORIES.join(", ")}.` };
        value.category = body.category;
    }
    if (body.recurrence !== undefined) {
        const frequency = body.recurrence?.frequency ?? "none";
        if (!RECURRENCE_FREQUENCIES.includes(frequency)) return { error: `recurrence.frequency must be one of: ${RECURRENCE_FREQUENCIES.join(", ")}.` };
        const until = body.recurrence?.until ?? null;
        if (until !== null && !Number.isFinite(Date.parse(until))) return { error: "recurrence.until must be a date." };
        value.recurrence = { frequency, until: until ? new Date(until) : null };
    }
    if (body.dueAt !== undefined) {
        if (body.dueAt !== null && !Number.isFinite(Date.parse(body.dueAt))) return { error: "dueAt must be a date." };
        value.dueAt = body.dueAt ? new Date(body.dueAt) : null;
    }
    if (value.recurrence?.frequency && value.recurrence.frequency !== "none" && value.dueAt === null) {
        return { error: "A recurring obligation needs a first due date." };
    }
    return { value };
}

// A best guess at the category of an extracted obligation.
export function guessCategory(text) {
    const value = String(text ?? "").toLowerCase();
    if (/rent|pay|deposit|advance|bill|charge|fee|ভাড়া|টাকা/.test(value)) return "payment";
    if (/repair|maint|fix|clean|paint|মেরামত/.test(value)) return "maintenance";
    if (/notice|notify|inform|নোটিশ/.test(value)) return "notice";
    if (/property|premises|key|furnit|fixture|alter/.test(value)) return "property";
    return "other";
}

const partyOf = (agreement, userId) => {
    const id = String(userId);
    if (String(agreement.renter?._id ?? agreement.renter) === id) return "renter";
    if (String(agreement.landlord?._id ?? agreement.landlord) === id) return "landlord";
    return null;
};

// Compliance across agreements: counts by state, the user's own
// responsibilities, and a list of obligations needing attention.
export function complianceSummary(agreements, userId, now = new Date()) {
    const totals = { overdue: 0, due_soon: 0, upcoming: 0, no_date: 0, completed: 0, disputed: 0, recurring: 0, proposed: 0 };
    const mine = { overdue: 0, due_soon: 0, open: 0 };
    const byCategory = {};
    const items = [];
    const perAgreement = [];
    for (const agreement of agreements) {
        const party = partyOf(agreement, userId);
        const counts = { overdue: 0, due_soon: 0, open: 0, completed: 0 };
        for (const obligation of agreement.obligations ?? []) {
            const state = obligationState(obligation, now);
            totals[state] += 1;
            if (isRecurring(obligation)) totals.recurring += 1;
            byCategory[obligation.category ?? "other"] = (byCategory[obligation.category ?? "other"] ?? 0) + 1;
            const isMine = party && (obligation.responsibleParty === party || obligation.responsibleParty === "shared");
            if (state === "overdue") counts.overdue += 1;
            if (state === "due_soon") counts.due_soon += 1;
            if (!["completed", "disputed"].includes(state)) counts.open += 1;
            if (state === "completed") counts.completed += 1;
            if (isMine && state === "overdue") mine.overdue += 1;
            if (isMine && state === "due_soon") mine.due_soon += 1;
            if (isMine && !["completed", "disputed"].includes(state)) mine.open += 1;
            items.push({
                agreementId: agreement._id,
                agreementTitle: agreement.title,
                obligationId: obligation._id,
                description: obligation.description,
                category: obligation.category ?? "other",
                responsibleParty: obligation.responsibleParty,
                mine: Boolean(isMine),
                dueAt: obligation.dueAt ?? null,
                amountBdt: obligation.amountBdt ?? null,
                recurrence: obligation.recurrence?.frequency ?? "none",
                status: obligation.status,
                state,
                daysOverdue: daysOverdue(obligation, now),
                lastCompletedAt: obligation.completions?.at(-1)?.completedAt ?? null,
            });
        }
        const proposed = (agreement.extraction?.proposedObligations ?? []).filter((p) => (p.decision?.status ?? "pending") === "pending").length;
        totals.proposed += proposed;
        const total = counts.open + counts.completed;
        perAgreement.push({
            agreementId: agreement._id,
            title: agreement.title,
            party,
            ...counts,
            proposed,
            // Share of dated obligations that aren't overdue.
            onTrackPercent: total ? Math.round(((total - counts.overdue) / total) * 100) : null,
        });
    }
    const rank = { overdue: 0, due_soon: 1, upcoming: 2, no_date: 3, disputed: 4, completed: 5 };
    items.sort((a, b) => rank[a.state] - rank[b.state] || new Date(a.dueAt ?? 8.64e15) - new Date(b.dueAt ?? 8.64e15));
    return { generatedAt: now, totals, mine, byCategory, agreements: perAgreement, items };
}
