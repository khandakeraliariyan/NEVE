import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import ComplianceOverview from "@/views/tenancy/ComplianceOverview";

export const metadata = { title: "Obligations" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <ComplianceOverview />
        </RequireAuth>
    );
}
