import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import Verification from "@/views/account/Verification";

export const metadata = { title: "Verification" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.VERIFICATION}>
            <Verification />
        </RequireAuth>
    );
}
