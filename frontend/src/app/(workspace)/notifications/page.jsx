import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import Notifications from "@/views/account/Notifications";

export const metadata = { title: "Notifications" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ANY}>
            <Notifications />
        </RequireAuth>
    );
}
