import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import MyProperties from "@/views/landlord/MyProperties";

export const metadata = { title: "My properties" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.LANDLORD}>
            <MyProperties />
        </RequireAuth>
    );
}
