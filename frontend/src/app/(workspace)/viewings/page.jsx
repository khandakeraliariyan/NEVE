import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import ViewingRequests from "@/views/renter/ViewingRequests";

export const metadata = { title: "Viewing requests" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.RENTER}>
            <ViewingRequests />
        </RequireAuth>
    );
}
