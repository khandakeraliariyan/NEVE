import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import TenancyDashboard from "@/views/tenancy/TenancyDashboard";

export const metadata = { title: "Tenancy dashboard" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <TenancyDashboard />
        </RequireAuth>
    );
}
