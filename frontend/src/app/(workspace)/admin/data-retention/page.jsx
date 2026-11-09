import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import DataRetention from "@/views/admin/DataRetention";

export const metadata = { title: "Data retention" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <DataRetention />
        </RequireAuth>
    );
}
