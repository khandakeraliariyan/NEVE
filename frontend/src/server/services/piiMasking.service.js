// Removes personal identifiers from document text before it is sent to an AI
// model: national ID numbers, passport numbers, phone numbers and email
// addresses. Bangla digits (০-৯) are recognised as well as Latin ones.
// Masking is deliberately broad: any 10, 13 or 17 digit number is treated as
// a possible NID, because missing one is worse than hiding a reference number.

export const MASKS = {
    nid: "[NID removed]",
    passport: "[passport number removed]",
    phone: "[phone number removed]",
    email: "[email removed]",
};

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
// Matches a Latin or Bangla digit.
const D = "[0-9০-৯]";
// Digit groups may be split by single spaces, dashes or dots.
const SEP = "[ \\-.]?";

const toLatinDigits = (value) => value.replace(/[০-৯]/g, (digit) => String(BANGLA_DIGITS.indexOf(digit)));
const digitsOnly = (value) => toLatinDigits(value).replace(/[^0-9]/g, "");

// Order matters: emails first (they can contain digits), then phones (which
// can look like 10+ digit numbers), then passports, then NIDs.
const PATTERNS = [
    {
        kind: "email",
        regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    },
    {
        // Bangladeshi mobiles: +880 / 880 / 0 then 1[3-9] and 8 more digits.
        kind: "phone",
        regex: new RegExp(`(?<![0-9০-৯])(?:(?:\\+|00)?(?:৮৮|88)${SEP}0?|[0০])${SEP}[1১]${SEP}[3-9৩-৯]${D}{2}${SEP}${D}{3}${SEP}${D}{3}(?![0-9০-৯])`, "g"),
    },
    {
        // Other international numbers written with a leading +.
        kind: "phone",
        regex: new RegExp(`\\+${SEP}[1-9১-৯](?:${SEP}${D}){7,14}(?![0-9০-৯])`, "g"),
    },
    {
        // Passport numbers next to the word "passport" (or পাসপোর্ট).
        kind: "passport",
        regex: /((?:passport|পাসপোর্ট)(?:\s*(?:no\.?|number|nr\.?|নং|নম্বর))?\s*[:#.-]?\s*)([A-Z]{1,2}[0-9০-৯]{6,8})\b/giu,
        group: 2,
    },
    {
        // 10, 13 or 17 digits, optionally in groups.
        kind: "nid",
        regex: new RegExp(`(?<![0-9০-৯])${D}(?:${SEP}${D}){9,16}(?![0-9০-৯])`, "g"),
        accept: (match) => [10, 13, 17].includes(digitsOnly(match).length),
    },
];

// Returns { text, counts: { nid, passport, phone, email } }.
export function maskPersonalIdentifiers(input) {
    const counts = { nid: 0, passport: 0, phone: 0, email: 0 };
    if (typeof input !== "string" || !input) return { text: input ?? "", counts };
    let text = input;
    for (const pattern of PATTERNS) {
        text = text.replace(pattern.regex, (...args) => {
            const match = args[0];
            if (pattern.group) {
                const prefix = args[1];
                counts[pattern.kind] += 1;
                return `${prefix}${MASKS[pattern.kind]}`;
            }
            if (pattern.accept && !pattern.accept(match)) return match;
            counts[pattern.kind] += 1;
            return MASKS[pattern.kind];
        });
    }
    return { text, counts };
}

export function totalMasked(counts) {
    return Object.values(counts ?? {}).reduce((sum, value) => sum + (value || 0), 0);
}

export function addCounts(a, b) {
    const result = { ...a };
    for (const [key, value] of Object.entries(b ?? {})) result[key] = (result[key] ?? 0) + value;
    return result;
}

// Masks each page; returns { pages, counts }.
export function maskPages(pages) {
    let counts = { nid: 0, passport: 0, phone: 0, email: 0 };
    const masked = pages.map((page) => {
        const result = maskPersonalIdentifiers(page.text);
        counts = addCounts(counts, result.counts);
        return { ...page, text: result.text };
    });
    return { pages: masked, counts };
}
