import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import ClausesAnnotations from "@/views/tenancy/ClausesAnnotations";

export const metadata = { title: "Clauses" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <ClausesAnnotations />
        </RequireAuth>
    );
}
