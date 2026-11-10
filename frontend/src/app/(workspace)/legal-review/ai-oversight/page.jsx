import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import AiOversight from "@/views/legal/AiOversight";

export const metadata = { title: "AI oversight" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.REVIEWER}>
            <AiOversight />
        </RequireAuth>
    );
}
