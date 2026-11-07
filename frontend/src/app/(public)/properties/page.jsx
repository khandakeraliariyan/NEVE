import { Suspense } from "react";
import { Loading } from "@/components/ui";
import PropertyDiscovery from "@/views/public/PropertyDiscovery";

export const metadata = { title: "Find homes" };

export default function Page() {
    return (
        <Suspense fallback={<Loading />}>
            <PropertyDiscovery />
        </Suspense>
    );
}
