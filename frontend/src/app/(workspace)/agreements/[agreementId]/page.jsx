import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import AgreementDetails from "@/views/tenancy/AgreementDetails";

export const metadata = { title: "Agreement" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <AgreementDetails />
        </RequireAuth>
    );
}
