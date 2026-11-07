"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Runs an async loader when its deps change; exposes data, loading, error and reload.
export function useApi(loader, deps = [], { enabled = true } = {}) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState(null);
    const loaderRef = useRef(loader);
    loaderRef.current = loader;

    const run = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await loaderRef.current();
            setData(result);
            return result;
        } catch (err) {
            setError(err);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (enabled) run();
        else setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, ...deps]);

    return { data, setData, loading, error, reload: run };
}
