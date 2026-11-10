import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import SystemJobs from "@/views/admin/SystemJobs";

export const metadata = { title: "Data retention & backups" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <SystemJobs />
        </RequireAuth>
    );
}
