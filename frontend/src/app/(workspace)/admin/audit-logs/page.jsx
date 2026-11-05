import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import AuditTrail from "@/views/admin/AuditTrail";

export const metadata = { title: "Audit trail" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <AuditTrail />
        </RequireAuth>
    );
}
