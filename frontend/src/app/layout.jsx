import { AuthProvider } from "@/context/AuthContext";
import "@/index.css";

export const metadata = {
    title: { default: "Neve", template: "%s · Neve" },
    description: "Rental discovery and tenancy records for renters and landlords in Bangladesh.",
    icons: { icon: "/favicon.svg" },
};

export const viewport = {
    width: "device-width",
    initialScale: 1,
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>
                <AuthProvider>{children}</AuthProvider>
            </body>
        </html>
    );
}
