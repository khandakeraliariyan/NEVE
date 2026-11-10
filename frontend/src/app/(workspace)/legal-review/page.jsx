import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import LegalSources from "@/views/legal/LegalSources";

export const metadata = { title: "Legal review" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.REVIEWER}>
            <LegalSources mode="reviewer" />
        </RequireAuth>
    );
}
