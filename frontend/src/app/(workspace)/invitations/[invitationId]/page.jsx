import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import InvitationDetail from "@/views/tenancy/InvitationDetail";

export const metadata = { title: "Tenancy invitation" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.INQUIRY}>
            <InvitationDetail />
        </RequireAuth>
    );
}
