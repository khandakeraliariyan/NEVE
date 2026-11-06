"use client";

import { useState } from "react";
import Link from "next/link";
import NavLink from "./NavLink";
import Logo from "./Logo";
import { PUBLIC_NAV } from "../nav";
import { homePathForRole, useAuth } from "../context/AuthContext";

export default function PublicLayout({ children }) {
    const { status, role, profile } = useAuth();
    const [open, setOpen] = useState(false);

    return (
        <div className="flex min-h-screen flex-col">
            <header className="sticky top-0 z-30 px-3 pt-3 md:px-6">
                <div className="nav-drop glass mx-auto flex max-w-7xl items-center justify-between gap-6 rounded-full border border-white/60 px-4 py-2.5 shadow-soft md:px-6">
                    <Logo />
                    <nav className="hidden items-center gap-1 text-sm lg:flex">
                        {PUBLIC_NAV.map((item) => (
                            <NavLink
                                key={item.to}
                                href={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                    `rounded-full px-4 py-2 ${isActive ? "bg-forest text-white" : "text-ink/80 hover:bg-sage hover:text-ink"}`
                                }
                            >
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>
                    <div className="hidden items-center gap-2 lg:flex">
                        {status === "ready" ? (
                            <Link
                                href={homePathForRole(role)}
                                className="flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-medium text-white hover:bg-forest-hover"
                            >
                                {profile?.displayName ?? "My workspace"} →
                            </Link>
                        ) : (
                            <>
                                <Link href="/sign-up" className="rounded-full px-4 py-2.5 text-sm text-ink hover:bg-sage">
                                    List a Property
                                </Link>
                                <Link href="/sign-in" className="rounded-full bg-forest px-5 py-2.5 text-sm font-medium text-white hover:bg-forest-hover">
                                    Sign In / Register
                                </Link>
                            </>
                        )}
                    </div>
                    <button
                        type="button"
                        className="rounded-full border border-line bg-white px-4 py-2 text-sm lg:hidden"
                        onClick={() => setOpen(!open)}
                        aria-expanded={open}
                    >
                        {open ? "Close" : "Menu"}
                    </button>
                </div>
                {open && (
                    <nav className="glass mx-auto mt-2 flex max-w-7xl flex-col gap-1 rounded-3xl border border-white/60 p-3 text-sm shadow-soft lg:hidden">
                        {PUBLIC_NAV.map((item) => (
                            <Link key={item.to} href={item.to} className="rounded-full px-4 py-2.5 hover:bg-sage" onClick={() => setOpen(false)}>
                                {item.label}
                            </Link>
                        ))}
                        <Link
                            href={status === "ready" ? homePathForRole(role) : "/sign-in"}
                            className="mt-1 rounded-full bg-forest px-4 py-2.5 text-center font-medium text-white"
                        >
                            {status === "ready" ? "My workspace" : "Sign In / Register"}
                        </Link>
                    </nav>
                )}
            </header>

            <main className="flex-1">{children}</main>

            <footer className="relative mx-3 mb-3 mt-20 overflow-hidden rounded-3xl bg-night text-white md:mx-6 md:mb-6">
                <div className="glow glow-drift -right-24 -top-32 h-80 w-[28rem] bg-taupe/40" aria-hidden="true" />
                <div className="glow -bottom-40 left-10 h-72 w-96 bg-white/10" aria-hidden="true" />
                <div className="relative mx-auto max-w-7xl px-6 pb-8 pt-14 md:px-12">
                    <div className="flex flex-wrap items-end justify-between gap-6 border-b border-white/10 pb-12">
                        <h2 data-reveal="up" className="max-w-xl text-4xl text-white md:text-5xl">
                            Find your place. <span className="text-taupe-soft">Know your rights.</span>
                        </h2>
                        <Link href="/properties" data-reveal="right" className="rounded-full bg-white px-6 py-3 text-sm font-medium text-night hover:bg-canvas">
                            Browse listings →
                        </Link>
                    </div>
                    <div className="grid gap-10 py-12 text-sm md:grid-cols-4">
                        <div className="space-y-3">
                            <Logo tone="light" />
                            <p className="text-white/60">Rental discovery and tenancy records for renters and landlords in Bangladesh.</p>
                        </div>
                        <div>
                            <p className="mb-3 text-xs uppercase tracking-widest text-white/40">Explore</p>
                            <ul className="space-y-2 text-white/75">
                                {PUBLIC_NAV.map((item) => (
                                    <li key={item.to}>
                                        <Link href={item.to} className="link-sweep hover:text-white">
                                            {item.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <p className="mb-3 text-xs uppercase tracking-widest text-white/40">Account</p>
                            <ul className="space-y-2 text-white/75">
                                <li><Link href="/sign-in" className="link-sweep hover:text-white">Sign in</Link></li>
                                <li><Link href="/sign-up" className="link-sweep hover:text-white">Create an account</Link></li>
                            </ul>
                        </div>
                        <div className="text-xs leading-relaxed text-white/50">
                            Neighborhood data © OpenStreetMap contributors. Cost figures and trust signals are estimates and review aids, not quotes,
                            verification or legal advice.
                        </div>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 border-t border-white/10 pt-6 text-xs text-white/40">
                        <span>© {new Date().getFullYear()} Neve</span>
                        <span>Made for renters and landlords in Bangladesh</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
