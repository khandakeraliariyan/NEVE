import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import MyFavorites from "@/views/renter/MyFavorites";

export const metadata = { title: "My favorites" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.RENTER}>
            <MyFavorites />
        </RequireAuth>
    );
}
