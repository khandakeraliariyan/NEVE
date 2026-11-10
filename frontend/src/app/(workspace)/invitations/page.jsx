import { Suspense } from "react";
import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import Invitations from "@/views/tenancy/Invitations";

export const metadata = { title: "Tenancy invitations" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.INQUIRY}>
            <Suspense fallback={null}>
                <Invitations />
            </Suspense>
        </RequireAuth>
    );
}
