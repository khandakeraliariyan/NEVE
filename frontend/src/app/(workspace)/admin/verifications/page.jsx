import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import VerificationQueue from "@/views/admin/VerificationQueue";

export const metadata = { title: "Verification queue" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <VerificationQueue />
        </RequireAuth>
    );
}
