"use client";

import { Children, useEffect, useRef, useState } from "react";

const EASE = (t) => 1 - Math.pow(1 - t, 3);

// Counts up from 0 to the numeric part of `value` when scrolled into view ("120+", "98%", "৳4,500" all work).
// Non-numeric values (e.g. "—") render as-is.
export function Counter({ value, duration = 1400, className = "" }) {
    if (typeof value !== "string" && typeof value !== "number") return value ?? null;
    const text = String(value);
    const match = text.match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/);
    if (!match) return <span className={className}>{text}</span>;
    // Keyed by the text so a new value restarts the count from zero.
    return <CounterText key={text} prefix={match[1]} raw={match[2]} suffix={match[3]} duration={duration} className={className} />;
}

function CounterText({ prefix, raw, suffix, duration, className }) {
    const target = Number(raw.replace(/,/g, ""));
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    const format = (n) => `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
    const ref = useRef(null);
    const [shown, setShown] = useState(() => format(0));

    useEffect(() => {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!("IntersectionObserver" in window)) {
            requestAnimationFrame(() => setShown(format(target)));
            return undefined;
        }

        let frame = 0;
        const io = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            io.disconnect();
            if (reduced) {
                setShown(format(target));
                return;
            }
            const start = performance.now();
            const tick = (now) => {
                const t = Math.min(1, (now - start) / duration);
                setShown(format(target * EASE(t)));
                if (t < 1) frame = requestAnimationFrame(tick);
            };
            frame = requestAnimationFrame(tick);
        });
        if (ref.current) io.observe(ref.current);
        return () => {
            io.disconnect();
            cancelAnimationFrame(frame);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target, duration]);

    return (
        <span ref={ref} className={`tabular-nums ${className}`}>
            {shown}
        </span>
    );
}

// Splits a line of text into words that rise in one after another.
export function WordReveal({ text, delay = 0, step = 60, className = "" }) {
    return text.split(" ").map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <span data-reveal="word" className={`inline-block ${className}`} style={{ "--reveal-delay": `${delay + i * step}ms` }}>
                {word}
                {" "}
            </span>
        </span>
    ));
}

// Button label that rolls up to a duplicate on hover (Framer-style text swap). Only for plain-text labels.
export function RollText({ children }) {
    const parts = Children.toArray(children);
    if (!parts.length || !parts.every((p) => typeof p === "string" || typeof p === "number")) return children;
    const label = parts.join("");
    return (
        <span className="roll">
            <span>{label}</span>
            <span aria-hidden="true">{label}</span>
        </span>
    );
}

// Accordion row with an animated height (grid-rows trick) and a rotating plus icon.
export function AccordionItem({ question, children, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-line">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-6 py-6 text-left font-display text-xl font-medium tracking-tight md:text-2xl"
            >
                {question}
                <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line transition duration-500 ${
                        open ? "rotate-45 bg-forest text-white" : "bg-white text-forest"
                    }`}
                    aria-hidden="true"
                >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                </span>
            </button>
            <div className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.44,0,0.56,1)] ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                    <p className={`max-w-2xl pb-6 leading-relaxed text-muted transition duration-500 ${open ? "opacity-100" : "opacity-0"}`}>{children}</p>
                </div>
            </div>
        </div>
    );
}
