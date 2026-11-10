import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import AIEvaluations from "@/views/admin/AIEvaluations";

export const metadata = { title: "AI evaluation run" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.REVIEWER}>
            <AIEvaluations readOnly basePath="/legal-review/ai-evaluations" />
        </RequireAuth>
    );
}
