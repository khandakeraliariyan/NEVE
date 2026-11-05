import { Suspense } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Loading } from "@/components/ui";
import { ROLES } from "@/lib/roles";
import PropertyForm from "@/views/landlord/PropertyForm";

export const metadata = { title: "Create property" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.LANDLORD}>
            <Suspense fallback={<Loading />}>
                <PropertyForm />
            </Suspense>
        </RequireAuth>
    );
}
