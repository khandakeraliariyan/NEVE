import PublicLayout from "@/components/PublicLayout";
import NotFound from "@/views/NotFound";

export const metadata = { title: "Page not found" };

export default function NotFoundPage() {
    return (
        <PublicLayout>
            <NotFound />
        </PublicLayout>
    );
}
