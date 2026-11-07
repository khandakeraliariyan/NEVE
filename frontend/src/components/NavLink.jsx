"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// next/link with active-state styling, like React Router's NavLink.
// `end` makes the match exact; otherwise nested paths also count as active.
export default function NavLink({ href, end = false, className, children, ...props }) {
    const pathname = usePathname();
    const isActive = end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    return (
        <Link
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={typeof className === "function" ? className({ isActive }) : className}
            {...props}
        >
            {children}
        </Link>
    );
}
