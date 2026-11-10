import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import PlatformSettings from "@/views/admin/PlatformSettings";

export const metadata = { title: "Platform settings" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <PlatformSettings />
        </RequireAuth>
    );
}
