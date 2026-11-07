"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, openPrivateFile, uploadFile } from "../../lib/api";
import { Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, StatusBadge, Tabs } from "../../components/ui";

const KINDS = {
    images: { purpose: "property_image", title: "Photos", max: 20, accept: "image/jpeg,image/png,image/webp", limit: "JPEG, PNG or WebP, up to 5 MB each" },
    videos: { purpose: "property_video", title: "Video tours", max: 5, accept: "video/mp4,video/webm", limit: "MP4 or WebM, up to 50 MB each" },
    floorPlans: { purpose: "floor_plan", title: "Floor plans", max: 5, accept: "application/pdf,image/jpeg,image/png,image/webp", limit: "PDF, JPEG, PNG or WebP, up to 10 MB each" },
};

export default function MediaFloorplans() {
    const { id } = useParams();
    const [kind, setKind] = useState("images");
    const [property, setProperty] = useState(null);
    const [publicMedia, setPublicMedia] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(null);
    const [removing, setRemoving] = useState(null);

    // Drafts aren't public, so media IDs come from the landlord's own listing list.
    const load = useCallback(async () => {
        setError(null);
        try {
            const payload = await api.get("/properties/mine");
            const found = (payload.properties ?? []).find((p) => p._id === id);
            if (!found) throw new Error("Listing not found, or you can't manage it.");
            setProperty(found);
            if (found.status === "published") {
                const media = await api.get(`/property-images/${id}`, null, { auth: false }).catch(() => null);
                setPublicMedia(media);
            } else {
                setPublicMedia(null);
            }
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    async function handleFiles(fileList) {
        const files = Array.from(fileList ?? []);
        if (!files.length) return;
        const config = KINDS[kind];
        const room = config.max - (property[kind]?.length ?? 0);
        if (files.length > room) {
            setError(`You can add ${room} more ${config.title.toLowerCase()}.`);
            return;
        }
        setError(null);
        try {
            for (const [index, file] of files.entries()) {
                setProgress(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
                const fileId = await uploadFile(file, { purpose: config.purpose, propertyId: id });
                await api.post(`/property-images/${id}/${fileId}/attach`);
            }
            await load();
        } catch (err) {
            setError(err);
        } finally {
            setProgress(null);
        }
    }

    async function remove(fileId) {
        if (!window.confirm("Remove this file from the listing?")) return;
        setRemoving(fileId);
        setError(null);
        try {
            await api.del(`/property-images/${id}/${fileId}`);
            await load();
        } catch (err) {
            setError(err);
        } finally {
            setRemoving(null);
        }
    }

    if (loading) return <Loading text="Loading media…" />;
    if (!property) return <ErrorBox error={error} onRetry={load} />;

    const config = KINDS[kind];
    const ids = (property[kind] ?? []).map(String);
    const urls = Object.fromEntries((publicMedia?.[kind] ?? []).map((m) => [String(m.id), m]));

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link href="/listings" className="hover:text-forest">My properties</Link> / <Link href={`/listings/${id}/edit`} className="hover:text-forest">{property.title}</Link> / Media & floor plans
            </nav>
            <PageHeader
                title="Media & floor plans"
                description="Photos, video tours and floor plans renters see on the listing. The first photo is used as the cover."
                actions={<StatusBadge status={property.status} />}
            />

            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                {Object.entries(KINDS).map(([key, k]) => (
                    <Card key={key} className="py-4">
                        <p className="eyebrow">{k.title}</p>
                        <p className="text-2xl font-semibold">
                            {property[key]?.length ?? 0}
                            <span className="text-sm font-normal text-muted"> / {k.max}</span>
                        </p>
                    </Card>
                ))}
            </div>

            <Tabs
                tabs={Object.entries(KINDS).map(([value, k]) => ({ value, label: `${k.title} (${property[value]?.length ?? 0})` }))}
                active={kind}
                onChange={setKind}
            />

            <Card className="mb-6">
                <label
                    className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sage-strong bg-mist px-6 py-10 text-center"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        handleFiles(e.dataTransfer.files);
                    }}
                >
                    <span className="text-lg text-forest">Drop {config.title.toLowerCase()} here or click to choose</span>
                    <span className="text-xs text-muted">{config.limit}</span>
                    <input
                        type="file"
                        multiple
                        accept={config.accept}
                        className="hidden"
                        disabled={Boolean(progress) || ids.length >= config.max}
                        onChange={(e) => {
                            handleFiles(e.target.files);
                            e.target.value = "";
                        }}
                    />
                </label>
                {progress && <p className="mt-3 text-sm text-forest">{progress}</p>}
                <div className="mt-3">
                    <ErrorBox error={error} />
                </div>
            </Card>

            {ids.length === 0 ? (
                <Empty title={`No ${config.title.toLowerCase()} yet`}>Listings with photos and a floor plan help renters decide before viewing.</Empty>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {ids.map((fileId, index) => {
                        const media = urls[fileId];
                        return (
                            <Card key={fileId} className="overflow-hidden p-0">
                                <div className="relative flex h-44 items-center justify-center bg-mist">
                                    {media && kind === "images" ? (
                                        <img src={media.url} alt={media.name ?? ""} className="h-full w-full object-cover" />
                                    ) : (
                                        <span className="text-sm text-muted">{kind === "videos" ? "▶ Video" : kind === "floorPlans" ? "Floor plan" : "Photo"}</span>
                                    )}
                                    {kind === "images" && index === 0 && (
                                        <span className="absolute left-2 top-2 rounded-full bg-forest px-2.5 py-0.5 text-xs font-semibold text-white">Cover</span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between gap-2 p-3 text-sm">
                                    <span className="truncate">{media?.name ?? `${config.title.slice(0, -1)} #${index + 1}`}</span>
                                    <div className="flex shrink-0 gap-2">
                                        <button type="button" className="text-forest underline" onClick={() => openPrivateFile(fileId).catch(setError)}>
                                            Open
                                        </button>
                                        <button type="button" className="text-rose-ink underline" disabled={removing === fileId} onClick={() => remove(fileId)}>
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Disclaimer title="Previews">Drafts show previews once published. Use “Open” to view any file through a short-lived private link.</Disclaimer>
                <Disclaimer title="Accuracy">Photos should show the property as it is now. Misleading photos can be reported by renters and reviewed by Neve.</Disclaimer>
            </div>
            <div className="mt-6 flex justify-between">
                <Link href={`/listings/${id}/edit`} className="text-sm text-forest underline">
                    ← Back to listing
                </Link>
                <Button as={Link} href="/listings">
                    Done →
                </Button>
            </div>
        </div>
    );
}
