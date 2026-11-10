import { Suspense } from "react";
import { Loading } from "@/components/ui";
import AdminSetup from "@/views/auth/AdminSetup";

export const metadata = { title: "Set up your admin account" };

export default function Page() {
    return (
        <Suspense fallback={<Loading />}>
            <AdminSetup />
        </Suspense>
    );
}
