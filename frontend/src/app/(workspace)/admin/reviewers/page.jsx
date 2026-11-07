import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import LegalReviewers from "@/views/admin/LegalReviewers";

export const metadata = { title: "Legal reviewers" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.ADMIN}>
            <LegalReviewers />
        </RequireAuth>
    );
}
