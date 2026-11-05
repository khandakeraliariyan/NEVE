import { useEffect, useState } from "react";

const KEY = "neve.compare";
const EVENT = "neve-compare-change";
export const COMPARE_MAX = 4;

function read() {
    try {
        const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
        return Array.isArray(value) ? value.slice(0, COMPARE_MAX) : [];
    } catch {
        return [];
    }
}

function write(ids) {
    try {
        localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
        // Storage can be unavailable (private mode); the selection just won't persist.
    }
    window.dispatchEvent(new Event(EVENT));
}

// Compare selection lives on the client so it works before sign-in.
export function useCompare() {
    // Start empty so the server render and first client render match, then load from storage.
    const [ids, setIds] = useState([]);

    useEffect(() => {
        const sync = () => setIds(read());
        sync();
        window.addEventListener(EVENT, sync);
        window.addEventListener("storage", sync);
        return () => {
            window.removeEventListener(EVENT, sync);
            window.removeEventListener("storage", sync);
        };
    }, []);

    return {
        ids,
        has: (id) => ids.includes(id),
        toggle: (id) => {
            const current = read();
            if (current.includes(id)) write(current.filter((x) => x !== id));
            else if (current.length < COMPARE_MAX) write([...current, id]);
        },
        remove: (id) => write(read().filter((x) => x !== id)),
        clear: () => write([]),
        full: ids.length >= COMPARE_MAX,
    };
}
