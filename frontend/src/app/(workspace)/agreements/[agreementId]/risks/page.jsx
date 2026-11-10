import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import ContractRisks from "@/views/tenancy/ContractRisks";

export const metadata = { title: "Risk check" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <ContractRisks />
        </RequireAuth>
    );
}
