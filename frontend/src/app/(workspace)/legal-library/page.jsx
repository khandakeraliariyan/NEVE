import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import LegalLibrary from "@/views/legal/LegalLibrary";

export const metadata = { title: "Legal library" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <LegalLibrary />
        </RequireAuth>
    );
}
