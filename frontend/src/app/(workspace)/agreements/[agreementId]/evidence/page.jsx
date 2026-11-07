import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import EvidenceGraph from "@/views/tenancy/EvidenceGraph";

export const metadata = { title: "Evidence graph" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <EvidenceGraph />
        </RequireAuth>
    );
}
