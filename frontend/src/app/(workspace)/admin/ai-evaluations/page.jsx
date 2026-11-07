import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import AIEvaluations from "@/views/admin/AIEvaluations";

export const metadata = { title: "AI evaluations" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <AIEvaluations />
        </RequireAuth>
    );
}
