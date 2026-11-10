import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import SecurityCenter from "@/views/admin/SecurityCenter";

export const metadata = { title: "Security" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <SecurityCenter />
        </RequireAuth>
    );
}
