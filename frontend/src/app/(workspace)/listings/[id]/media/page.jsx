import RequireAuth from "@/components/RequireAuth";
import { ROLES } from "@/lib/roles";
import MediaFloorplans from "@/views/landlord/MediaFloorplans";

export const metadata = { title: "Media & floor plans" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.LANDLORD}>
            <MediaFloorplans />
        </RequireAuth>
    );
}
