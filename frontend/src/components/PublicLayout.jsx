import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import Logo from "./Logo";
import { PUBLIC_NAV } from "../nav";
import { homePathForRole, useAuth } from "../context/AuthContext";

export default function PublicLayout() {
    const { status, role, profile } = useAuth();
    const [open, setOpen] = useState(false);

    return (
        <div className="flex min-h-screen flex-col">
            <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 md:px-8">
                    <Logo />
                    <nav className="hidden items-center gap-7 text-sm lg:flex">
                        {PUBLIC_NAV.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                    `border-b-2 pb-1 ${isActive ? "border-forest text-forest" : "border-transparent text-ink hover:text-forest"}`
                                }
                            >
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>
                    <div className="hidden items-center gap-3 lg:flex">
                        {status === "ready" ? (
                            <Link
                                to={homePathForRole(role)}
                                className="flex items-center gap-2 rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white"
                            >
                                {profile?.displayName ?? "My workspace"} →
                            </Link>
                        ) : (
                            <>
                                <Link to="/sign-up" className="rounded-lg border border-forest/40 px-4 py-2 text-sm text-forest hover:bg-sage">
                                    List a Property
                                </Link>
                                <Link to="/sign-in" className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-hover">
                                    Sign In / Register
                                </Link>
                            </>
                        )}
                    </div>
                    <button type="button" className="rounded-lg border border-line px-3 py-2 text-sm lg:hidden" onClick={() => setOpen(!open)}>
                        Menu
                    </button>
                </div>
                {open && (
                    <nav className="flex flex-col gap-1 border-t border-line px-4 py-3 text-sm lg:hidden">
                        {PUBLIC_NAV.map((item) => (
                            <Link key={item.to} to={item.to} className="py-2" onClick={() => setOpen(false)}>
                                {item.label}
                            </Link>
                        ))}
                        <Link to={status === "ready" ? homePathForRole(role) : "/sign-in"} className="py-2 font-semibold text-forest">
                            {status === "ready" ? "My workspace" : "Sign In / Register"}
                        </Link>
                    </nav>
                )}
            </header>

            <main className="flex-1">
                <Outlet />
            </main>

            <footer className="mt-16 border-t border-line bg-panel">
                <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm md:grid-cols-4 md:px-8">
                    <div>
                        <p className="mb-2 text-lg">Neve</p>
                        <p className="text-muted">
                            Rental discovery and tenancy records for renters, landlords and property managers in Bangladesh.
                        </p>
                    </div>
                    <div>
                        <p className="mb-2 font-semibold">Explore</p>
                        <ul className="space-y-1 text-muted">
                            {PUBLIC_NAV.map((item) => (
                                <li key={item.to}>
                                    <Link to={item.to} className="hover:text-forest">
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <p className="mb-2 font-semibold">Account</p>
                        <ul className="space-y-1 text-muted">
                            <li><Link to="/sign-in" className="hover:text-forest">Sign in</Link></li>
                            <li><Link to="/sign-up" className="hover:text-forest">Create an account</Link></li>
                        </ul>
                    </div>
                    <div className="text-xs text-muted">
                        Neighborhood data © OpenStreetMap contributors. Cost figures and trust signals are estimates and review aids, not quotes,
                        verification or legal advice.
                    </div>
                </div>
                <div className="border-t border-line px-4 py-4 text-center text-xs text-muted">© {new Date().getFullYear()} Neve</div>
            </footer>
        </div>
    );
}
