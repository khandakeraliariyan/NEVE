import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import CaseEvidenceReview from "@/views/tenancy/CaseEvidenceReview";

export const metadata = { title: "Case review" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.TENANCY}>
            <CaseEvidenceReview />
        </RequireAuth>
    );
}
