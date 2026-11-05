import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import ViewingManagement from "@/views/landlord/ViewingManagement";

export const metadata = { title: "Viewing management" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.LANDLORD}>
            <ViewingManagement />
        </RequireAuth>
    );
}
