import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import ListingClaims from "@/views/landlord/ListingClaims";

export const metadata = { title: "Listing claims" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.LANDLORD}>
            <ListingClaims />
        </RequireAuth>
    );
}
