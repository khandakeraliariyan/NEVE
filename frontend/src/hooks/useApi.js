"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Runs an async loader when its deps change; exposes data, loading, error and reload.
export function useApi(loader, deps = [], { enabled = true } = {}) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState(null);
    const loaderRef = useRef(loader);
    // Keep the latest loader without touching the ref during render. Declared before the
    // load effect below, so effects see the current loader when they run.
    useEffect(() => {
        loaderRef.current = loader;
    });

    // Only the newest request may update state, so a slow earlier response can't overwrite a later one.
    const latest = useRef(0);

    const run = useCallback(async () => {
        const id = ++latest.current;
        setLoading(true);
        setError(null);
        try {
            const result = await loaderRef.current();
            if (id === latest.current) setData(result);
            return result;
        } catch (err) {
            if (id === latest.current) setError(err);
            return null;
        } finally {
            if (id === latest.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!enabled) return undefined;
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) run();
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, ...deps]);

    return { data, setData, loading: enabled && loading, error, reload: run };
}
