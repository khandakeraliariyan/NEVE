import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import CaseQueue from "@/views/tenancy/CaseQueue";

export const metadata = { title: "Case queue" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.REVIEWER}>
            <CaseQueue />
        </RequireAuth>
    );
}
