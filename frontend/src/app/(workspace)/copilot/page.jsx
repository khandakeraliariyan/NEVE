import { Suspense } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Loading } from "@/components/ui";
import { ROLES } from "@/lib/roles";
import LegalCopilot from "@/views/legal/LegalCopilot";

export const metadata = { title: "Legal Copilot" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <Suspense fallback={<Loading />}>
                <LegalCopilot />
            </Suspense>
        </RequireAuth>
    );
}
