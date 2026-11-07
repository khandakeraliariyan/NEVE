import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import Recommendations from "@/views/renter/Recommendations";

export const metadata = { title: "Recommendations" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.RENTER}>
            <Recommendations />
        </RequireAuth>
    );
}
