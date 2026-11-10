"use client";

import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { date } from "../../lib/format";
import { ErrorBox, Loading } from "../../components/ui";

// The privacy policy an admin publishes in platform settings.
export default function PrivacyPolicy() {
    const policy = useApi(() => api.get("/platform/privacy-policy", undefined, { auth: false }), []);
    const data = policy.data?.data;
    return (
        <div className="mx-auto max-w-3xl px-4 py-16">
            <p className="eyebrow">Neve</p>
            <h1 className="mb-2 text-4xl">Privacy policy</h1>
            {data && (
                <p className="mb-8 text-sm text-muted">
                    Version {data.version}
                    {data.updatedAt ? ` · updated ${date(data.updatedAt)}` : ""}
                </p>
            )}
            {policy.loading && <Loading />}
            <ErrorBox error={policy.error} onRetry={policy.reload} />
            {data && <div className="whitespace-pre-line leading-relaxed">{data.text}</div>}
        </div>
    );
}
