import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import ConditionComparison from "@/views/tenancy/ConditionComparison";

export const metadata = { title: "Condition comparison" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <ConditionComparison />
        </RequireAuth>
    );
}
