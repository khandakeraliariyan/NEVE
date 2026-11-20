import { Inter, Plus_Jakarta_Sans, Noto_Sans_Bengali } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import RevealObserver from "@/components/RevealObserver";
import "@/index.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const heading = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-heading", display: "swap" });
// Bangla fallback so Bengali text in agreements, listings and the copilot renders in a matching face.
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], weight: ["400", "500", "600", "700"], variable: "--font-bengali", display: "swap" });

// Runs before first paint so scroll-reveal elements start hidden instead of flashing in.
const REVEAL_BOOT = `if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&"IntersectionObserver" in window)document.documentElement.classList.add("reveal-ready")`;

export const metadata = {
    title: { default: "Neve", template: "%s · Neve" },
    description: "Rental discovery and tenancy records for renters and landlords in Bangladesh.",
};

export const viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: "#a39587",
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" className={`${body.variable} ${heading.variable} ${bengali.variable}`} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: REVEAL_BOOT }} />
            </head>
            <body>
                <AuthProvider>{children}</AuthProvider>
                <RevealObserver />
            </body>
        </html>
    );
}
