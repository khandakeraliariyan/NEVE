import { Suspense } from "react";
import { Loading } from "@/components/ui";
import AdminSignIn from "@/views/auth/AdminSignIn";

export const metadata = { title: "Admin sign in" };

export default function Page() {
    return (
        <Suspense fallback={<Loading />}>
            <AdminSignIn />
        </Suspense>
    );
}
