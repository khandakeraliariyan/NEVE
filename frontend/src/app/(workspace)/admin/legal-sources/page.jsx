import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import LegalSources from "@/views/legal/LegalSources";

export const metadata = { title: "Legal sources" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <LegalSources mode="admin" />
        </RequireAuth>
    );
}
