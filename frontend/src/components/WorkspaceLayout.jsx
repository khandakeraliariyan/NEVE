import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import Logo from "./Logo";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS, workspaceNav } from "../nav";
import { api } from "../lib/api";

const UNREAD_POLL_MS = 5 * 60 * 1000;

function NotificationBell() {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const load = () =>
            api
                .get("/notifications/unread-count")
                .then((payload) => !cancelled && setCount(payload.unreadCount ?? payload.data?.unreadCount ?? 0))
                .catch(() => {});
        load();
        const timer = setInterval(load, UNREAD_POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);

    return (
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full text-forest" title={`${count} unread notifications`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-amber-ink px-1 text-center text-[0.6rem] font-bold text-white">
                    {count > 99 ? "99+" : count}
                </span>
            )}
        </span>
    );
}

export default function WorkspaceLayout() {
    const { profile, role, signOut } = useAuth();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const groups = workspaceNav(role);

    const sidebar = (
        <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-6">
            <div>
                <Logo subtitle={ROLE_LABELS[role]} />
            </div>
            <nav className="flex flex-col gap-5 text-sm">
                {groups.map((group) => (
                    <div key={group.title}>
                        <p className="eyebrow mb-2 px-3">{group.title}</p>
                        <ul className="flex flex-col gap-0.5">
                            {group.items.map((item) => (
                                <li key={item.to}>
                                    <NavLink
                                        to={item.to}
                                        end={item.end}
                                        onClick={() => setMenuOpen(false)}
                                        className={({ isActive }) =>
                                            `flex items-center justify-between rounded-lg px-3 py-2 ${
                                                isActive ? "bg-forest text-white" : "text-ink hover:bg-sage"
                                            }`
                                        }
                                    >
                                        {item.label}
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </nav>
            <div className="mt-auto rounded-xl border border-line bg-panel p-3 text-xs text-muted">
                <p className="font-semibold text-forest">Your records stay private</p>
                <p className="mt-1">Files open through short-lived links. Only people you share with can see tenancy records.</p>
            </div>
        </div>
    );

    return (
        <div className="flex min-h-screen">
            <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-mist lg:block">{sidebar}</aside>

            {menuOpen && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/30" onClick={() => setMenuOpen(false)} />
                    <aside className="relative h-full w-72 bg-mist shadow-xl">{sidebar}</aside>
                </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur md:px-8">
                    <div className="flex items-center gap-3">
                        <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-sm lg:hidden" onClick={() => setMenuOpen(true)}>
                            Menu
                        </button>
                        <Link to="/properties" className="hidden rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-hover sm:inline-flex">
                            Find Properties
                        </Link>
                    </div>
                    <div className="flex items-center gap-4">
                        <NotificationBell />
                        <Link to="/settings" className="rounded-lg px-2 py-1 text-right text-sm leading-tight hover:bg-sage" title="Account settings">
                            <p className="font-semibold">{profile?.displayName}</p>
                            <p className="text-xs text-muted">{ROLE_LABELS[role]}</p>
                        </Link>
                        <button
                            type="button"
                            onClick={async () => {
                                await signOut();
                                navigate("/");
                            }}
                            className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-sage"
                        >
                            Sign out
                        </button>
                    </div>
                </header>
                <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
