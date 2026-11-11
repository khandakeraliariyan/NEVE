import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import SystemErrors from "@/views/admin/SystemErrors";

export const metadata = { title: "System errors" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <SystemErrors />
        </RequireAuth>
    );
}
