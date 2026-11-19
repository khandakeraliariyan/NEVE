import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import RiskSentinel from "@/views/tenancy/RiskSentinel";

export const metadata = { title: "Risk Sentinel" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <RiskSentinel />
        </RequireAuth>
    );
}
