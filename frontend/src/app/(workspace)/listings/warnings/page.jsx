import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import ListingWarnings from "@/views/landlord/ListingWarnings";

export const metadata = { title: "Listing warnings" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.LANDLORD}>
            <ListingWarnings />
        </RequireAuth>
    );
}
