"use client";

import { useEffect } from "react";

// Scroll-reveal for any element with `data-reveal` (up | right | left | scale), app-wide.
// Elements fade/slide in once when they enter the viewport; stagger with style={{ "--reveal-delay": "100ms" }}.
// Elements added later (route changes, loaded data) are picked up through a MutationObserver.
export default function RevealObserver() {
    useEffect(() => {
        const root = document.documentElement;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduced || !("IntersectionObserver" in window)) {
            root.classList.remove("reveal-ready");
            return undefined;
        }

        const io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const el = entry.target;
                    io.unobserve(el);
                    el.classList.add("is-in");
                    // Once the entrance is over, drop the reveal transition so hover effects keep their own timing.
                    const delay = parseFloat(getComputedStyle(el).getPropertyValue("--reveal-delay")) || 0;
                    setTimeout(() => el.classList.add("reveal-done"), delay + 800);
                }
            },
            { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
        );

        const scan = () => document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => io.observe(el));

        // Adding classes to server-rendered elements before React has attached to them makes React report a
        // hydration mismatch. So start only once the page has loaded, with a short pause for hydration to finish.
        let frame = 0;
        let started = false;
        let startTimer = 0;
        const mo = new MutationObserver(() => {
            if (!started) return;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(scan);
        });
        const start = () => {
            startTimer = setTimeout(() => {
                started = true;
                scan();
                mo.observe(document.body, { childList: true, subtree: true });
            }, 150);
        };
        if (document.readyState === "complete") start();
        else window.addEventListener("load", start, { once: true });

        return () => {
            window.removeEventListener("load", start);
            clearTimeout(startTimer);
            io.disconnect();
            mo.disconnect();
            cancelAnimationFrame(frame);
        };
    }, []);

    return null;
}
