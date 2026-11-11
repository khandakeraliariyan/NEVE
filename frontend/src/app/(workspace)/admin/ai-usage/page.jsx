import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import AIUsage from "@/views/admin/AIUsage";

export const metadata = { title: "AI usage & cost" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <AIUsage />
        </RequireAuth>
    );
}
