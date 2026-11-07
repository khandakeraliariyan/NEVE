import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import PlatformHealth from "@/views/admin/PlatformHealth";

export const metadata = { title: "Platform health" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <PlatformHealth />
        </RequireAuth>
    );
}
