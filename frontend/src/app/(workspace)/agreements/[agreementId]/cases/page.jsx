import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import DisputeCases from "@/views/tenancy/DisputeCases";

export const metadata = { title: "Dispute cases" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <DisputeCases />
        </RequireAuth>
    );
}
