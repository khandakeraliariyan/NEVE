import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import SavedSearches from "@/views/renter/SavedSearches";

export const metadata = { title: "Saved searches" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.RENTER}>
            <SavedSearches />
        </RequireAuth>
    );
}
