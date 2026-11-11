import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import AccountAppeals from "@/views/admin/AccountAppeals";

export const metadata = { title: "Account appeals" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <AccountAppeals />
        </RequireAuth>
    );
}
