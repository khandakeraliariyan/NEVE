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
import PropertyComparison from "./pages/public/PropertyComparison";
import RenterDashboard from "./pages/renter/RenterDashboard";
import MyFavorites from "./pages/renter/MyFavorites";
import Recommendations from "./pages/renter/Recommendations";
import ViewingRequests from "./pages/renter/ViewingRequests";
import LandlordDashboard from "./pages/landlord/LandlordDashboard";
import MyProperties from "./pages/landlord/MyProperties";
import PropertyForm from "./pages/landlord/PropertyForm";

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
                <Route path="compare" element={<PropertyComparison />} />
                <Route path="*" element={<NotFound />} />
            </Route>

            <Route element={<RequireAuth />}>
                <Route element={<WorkspaceLayout />}>
                    <Route element={<RequireAuth roles={["renter"]} />}>
                        <Route path="renter" element={<RenterDashboard />} />
                        <Route path="saved" element={<MyFavorites />} />
                        <Route path="recommendations" element={<Recommendations />} />
                        <Route path="viewings" element={<ViewingRequests />} />
                    </Route>
                    <Route element={<RequireAuth roles={["landlord", "property_manager"]} />}>
                        <Route path="dashboard" element={<LandlordDashboard />} />
                        <Route path="listings" element={<MyProperties />} />
                        <Route path="listings/new" element={<PropertyForm />} />
                        <Route path="listings/:id/edit" element={<PropertyForm />} />
                    </Route>
                </Route>
            </Route>
        </Routes>
    );
}
