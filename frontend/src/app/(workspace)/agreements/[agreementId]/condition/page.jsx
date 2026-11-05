import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import ConditionReports from "@/views/tenancy/ConditionReports";

export const metadata = { title: "Condition reports" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <ConditionReports />
        </RequireAuth>
    );
}
