import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import Moderation from "@/views/admin/Moderation";

export const metadata = { title: "Moderation" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <Moderation />
        </RequireAuth>
    );
}
