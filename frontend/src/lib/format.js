const bdt = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 });

// Null means "unknown": never render it as zero.
export function money(value, { unknown = "Unknown" } = {}) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return unknown;
    return `৳${bdt.format(Number(value))}`;
}

export function date(value, options = { day: "numeric", month: "short", year: "numeric" }) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", options);
}

export function dateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function relativeTime(value) {
    if (!value) return "";
    const diff = Date.now() - new Date(value).getTime();
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    return date(value);
}

// "semi_furnished" -> "Semi furnished"
export function label(value) {
    if (!value) return "—";
    const text = String(value).replace(/_/g, " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function percent(value, digits = 0) {
    if (value === null || value === undefined) return "—";
    return `${(Number(value) * (Number(value) <= 1 ? 100 : 1)).toFixed(digits)}%`;
}

export function idOf(value) {
    if (!value) return null;
    return typeof value === "object" ? value._id ?? value.id ?? null : value;
}
