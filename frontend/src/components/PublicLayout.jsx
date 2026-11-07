"use client";

import { useState } from "react";
import Link from "next/link";
import NavLink from "./NavLink";
import Logo from "./Logo";
import { PUBLIC_NAV } from "../nav";
import { homePathForRole, useAuth } from "../context/AuthContext";
import { ArrowSwap, NavRoll } from "./motion";

const NAV_LINKS = [{ to: "/", label: "Home", end: true }, ...PUBLIC_NAV];

export default function PublicLayout({ children }) {
    const { status, role, profile } = useAuth();
    const [open, setOpen] = useState(false);

    return (
        <div className="flex min-h-screen flex-col">
            {/* Homevia-style navbar: transparent, laid over the top of the page, scrolls away with it. */}
            <header className="absolute inset-x-0 top-0 z-30">
                <div className="nav-drop mx-auto hidden w-full max-w-[1180px] items-center justify-between p-5 lg:flex">
                    <Logo tone="light" size={34} />
                    <nav className="flex items-center gap-7">
                        {NAV_LINKS.map((item) => (
                            <NavLink key={item.to} href={item.to} end={item.end} className="hv-nav-link">
                                <NavRoll>{item.label}</NavRoll>
                            </NavLink>
                        ))}
                        {status !== "ready" && (
                            <NavLink href="/sign-up" end className="hv-nav-link">
                                <NavRoll>List a Property</NavRoll>
                            </NavLink>
                        )}
                    </nav>
                    <Link href={status === "ready" ? homePathForRole(role) : "/sign-in"} className="hv-nav-cta">
                        {status === "ready" ? profile?.displayName ?? "My workspace" : "Sign In"}
                        <ArrowSwap />
                    </Link>
                </div>

                {/* Phone/tablet: black bar with logo and a two-line menu button, as on Homevia */}
                <div className="bg-black lg:hidden">
                    <div className="flex items-center justify-between p-5">
                        <Logo tone="light" size={34} />
                        <button
                            type="button"
                            onClick={() => setOpen(!open)}
                            aria-expanded={open}
                            aria-label={open ? "Close menu" : "Open menu"}
                            className="relative flex h-10 w-10 items-center justify-center rounded-xl"
                        >
                            <span className={`absolute h-[2px] w-6 rounded-sm bg-white transition duration-300 ${open ? "rotate-45" : "-translate-y-[4px]"}`} />
                            <span className={`absolute h-[2px] w-6 rounded-sm bg-white transition duration-300 ${open ? "-rotate-45" : "translate-y-[4px]"}`} />
                        </button>
                    </div>
                    {open && (
                        <nav className="flex flex-col gap-1 px-5 pb-6">
                            {NAV_LINKS.map((item) => (
                                <NavLink key={item.to} href={item.to} end={item.end} className="hv-nav-link py-1" onClick={() => setOpen(false)}>
                                    <NavRoll>{item.label}</NavRoll>
                                </NavLink>
                            ))}
                            {status !== "ready" && (
                                <NavLink href="/sign-up" end className="hv-nav-link py-1" onClick={() => setOpen(false)}>
                                    <NavRoll>List a Property</NavRoll>
                                </NavLink>
                            )}
                            <Link
                                href={status === "ready" ? homePathForRole(role) : "/sign-in"}
                                className="hv-nav-cta mt-4 self-start"
                                onClick={() => setOpen(false)}
                            >
                                {status === "ready" ? "My workspace" : "Sign In"}
                                <ArrowSwap />
                            </Link>
                        </nav>
                    )}
                </div>
            </header>

            {/* Leaves room for the overlaid navbar (20px padding + 44px row + 20px). */}
            <main className="flex-1 pt-[84px]">{children}</main>

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
