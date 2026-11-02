import { Route, Routes } from "react-router-dom";
import PublicLayout from "./components/PublicLayout";
import WorkspaceLayout from "./components/WorkspaceLayout";
import RequireAuth from "./components/RequireAuth";
import SignIn from "./pages/auth/SignIn";
import SignUp from "./pages/auth/SignUp";
import CompleteProfile from "./pages/auth/CompleteProfile";
import NotFound from "./pages/NotFound";
import Landing from "./pages/public/Landing";
import PropertyDiscovery from "./pages/public/PropertyDiscovery";
import PropertyDetails from "./pages/public/property/PropertyDetails";
import NeighborhoodIntel from "./pages/public/property/NeighborhoodIntel";
import TrueCost from "./pages/public/property/TrueCost";

export default function App() {
    return (
        <Routes>
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/sign-up" element={<SignUp />} />
            <Route path="/complete-profile" element={<CompleteProfile />} />

            <Route element={<PublicLayout />}>
                <Route index element={<Landing />} />
                <Route path="properties" element={<PropertyDiscovery />} />
                <Route path="properties/:id" element={<PropertyDetails />} />
                <Route path="properties/:id/neighborhood" element={<NeighborhoodIntel />} />
                <Route path="properties/:id/true-cost" element={<TrueCost />} />
                <Route path="*" element={<NotFound />} />
            </Route>

            <Route element={<RequireAuth />}>
                <Route element={<WorkspaceLayout />} />
            </Route>
        </Routes>
    );
}
