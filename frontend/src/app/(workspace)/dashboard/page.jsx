import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import LandlordDashboard from "@/views/landlord/LandlordDashboard";

export const metadata = { title: "Dashboard" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.LANDLORD}>
            <LandlordDashboard />
        </RequireAuth>
    );
}
