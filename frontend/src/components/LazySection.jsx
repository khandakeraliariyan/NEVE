"use client";

import { useEffect, useRef, useState } from "react";

// Renders children only once the section scrolls near the viewport, to save API requests.
export default function LazySection({ children, className = "", minHeight = 200 }) {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node || visible) return undefined;
        if (!("IntersectionObserver" in window)) {
            const timer = setTimeout(() => setVisible(true), 0);
            return () => clearTimeout(timer);
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: "200px" }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [visible]);

    return (
        <div ref={ref} className={className} style={visible ? undefined : { minHeight }}>
            {visible ? children : null}
        </div>
    );
}
