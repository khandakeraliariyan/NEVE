import { Suspense } from "react";
import { Loading } from "@/components/ui";
import SignIn from "@/views/auth/SignIn";

export const metadata = { title: "Sign in" };

export default function Page() {
    return (
        <Suspense fallback={<Loading />}>
            <SignIn />
        </Suspense>
    );
}
