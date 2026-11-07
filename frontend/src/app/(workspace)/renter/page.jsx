import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import RenterDashboard from "@/views/renter/RenterDashboard";

export const metadata = { title: "Dashboard" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.RENTER}>
            <RenterDashboard />
        </RequireAuth>
    );
}
