import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import DocumentVault from "@/views/tenancy/DocumentVault";

export const metadata = { title: "Documents" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <DocumentVault />
        </RequireAuth>
    );
}
