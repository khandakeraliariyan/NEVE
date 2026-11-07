import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import Maintenance from "@/views/tenancy/Maintenance";

export const metadata = { title: "Maintenance" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <Maintenance />
        </RequireAuth>
    );
}
