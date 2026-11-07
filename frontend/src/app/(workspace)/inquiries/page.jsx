import { Suspense } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Loading } from "@/components/ui";
import { ROLES } from "@/lib/roles";
import Inquiries from "@/views/shared/Inquiries";

export const metadata = { title: "Inquiries" };

export default function Page() {
    return (
        <RequireAuth roles={ROLES.INQUIRY}>
            <Suspense fallback={<Loading />}>
                <Inquiries />
            </Suspense>
        </RequireAuth>
    );
}
