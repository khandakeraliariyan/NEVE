import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

// Saved-listing state for renters. Other visitors are sent to sign in.
export function useSaved() {
    const { role, status } = useAuth();
    const navigate = useNavigate();
    const [savedIds, setSavedIds] = useState(() => new Set());
    const [error, setError] = useState(null);
    const isRenter = status === "ready" && role === "renter";

    useEffect(() => {
        if (!isRenter) return;
        api.get("/saved-properties", { page: 1, limit: 50 })
            .then((payload) => setSavedIds(new Set((payload.results ?? []).map((entry) => entry.property?._id))))
            .catch(() => {});
    }, [isRenter]);

    const toggle = useCallback(
        async (property) => {
            if (status !== "ready") {
                navigate("/sign-in");
                return;
            }
            if (!isRenter) {
                setError("Only renter accounts can save listings.");
                return;
            }
            const id = property._id;
            const wasSaved = savedIds.has(id);
            setSavedIds((current) => {
                const next = new Set(current);
                if (wasSaved) next.delete(id);
                else next.add(id);
                return next;
            });
            try {
                if (wasSaved) await api.del(`/saved-properties/${id}`);
                else await api.post(`/saved-properties/${id}`);
            } catch (err) {
                setError(err.message);
                setSavedIds((current) => {
                    const next = new Set(current);
                    if (wasSaved) next.add(id);
                    else next.delete(id);
                    return next;
                });
            }
        },
        [isRenter, navigate, savedIds, status]
    );

    return { isSaved: (id) => savedIds.has(id), toggle, error, clearError: () => setError(null), isRenter };
}
