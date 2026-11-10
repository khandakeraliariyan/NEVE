import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import UserManagement from "@/views/admin/UserManagement";

export const metadata = { title: "Users" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <UserManagement />
        </RequireAuth>
    );
}
