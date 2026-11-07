import { ButtonLink } from "../components/ui";
import { LogoMark } from "../components/Logo";

export default function NotFound() {
    return (
        <div className="mx-auto max-w-md px-4 py-24 text-center">
            <LogoMark size={64} className="mx-auto mb-6 shadow-soft" />
            <p className="eyebrow mb-2">404</p>
            <h1 className="text-3xl">Page not found</h1>
            <p className="mt-2 text-muted">This page doesn't exist, or you don't have access to it.</p>
            <ButtonLink to="/" className="mt-6">
                Back to home
            </ButtonLink>
        </div>
    );
}
