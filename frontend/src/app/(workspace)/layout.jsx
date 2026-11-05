import RequireAuth from "@/components/RequireAuth";
import WorkspaceLayout from "@/components/WorkspaceLayout";

// Every workspace page needs a signed-in user with a Neve profile; pages add role checks.
export default function Layout({ children }) {
    return (
        <RequireAuth>
            <WorkspaceLayout>{children}</WorkspaceLayout>
        </RequireAuth>
    );
}
