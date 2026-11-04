import { Route, Routes } from "react-router-dom";
import PublicLayout from "./components/PublicLayout";
import WorkspaceLayout from "./components/WorkspaceLayout";
import RequireAuth from "./components/RequireAuth";
import SignIn from "./pages/auth/SignIn";
import AdminSignIn from "./pages/auth/AdminSignIn";
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
import MediaFloorplans from "./pages/landlord/MediaFloorplans";
import ViewingManagement from "./pages/landlord/ViewingManagement";
import TenancyDashboard from "./pages/tenancy/TenancyDashboard";
import AgreementDetails from "./pages/tenancy/AgreementDetails";
import ClausesAnnotations from "./pages/tenancy/ClausesAnnotations";
import EvidenceGraph from "./pages/tenancy/EvidenceGraph";
import ConditionComparison from "./pages/tenancy/ConditionComparison";
import DisputeCases from "./pages/tenancy/DisputeCases";
import CaseQueue from "./pages/tenancy/CaseQueue";
import CaseEvidenceReview from "./pages/tenancy/CaseEvidenceReview";
import PlatformHealth from "./pages/admin/PlatformHealth";
import AuditTrail from "./pages/admin/AuditTrail";
import AIEvaluations from "./pages/admin/AIEvaluations";
import AccountSettings from "./pages/account/AccountSettings";
import Inquiries from "./pages/shared/Inquiries";
import ConditionReports from "./pages/tenancy/ConditionReports";
import Maintenance from "./pages/tenancy/Maintenance";
import ListingClaims from "./pages/landlord/ListingClaims";
import LegalReviewers from "./pages/admin/LegalReviewers";

const TENANCY_ROLES = ["renter", "landlord", "legal_reviewer"];

export default function App() {
    return (
        <Routes>
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/admin/sign-in" element={<AdminSignIn />} />
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
                    <Route path="settings" element={<AccountSettings />} />
                    <Route element={<RequireAuth roles={["renter", "landlord"]} />}>
                        <Route path="inquiries" element={<Inquiries />} />
                    </Route>
                    <Route element={<RequireAuth roles={["renter"]} />}>
                        <Route path="renter" element={<RenterDashboard />} />
                        <Route path="saved" element={<MyFavorites />} />
                        <Route path="recommendations" element={<Recommendations />} />
                        <Route path="viewings" element={<ViewingRequests />} />
                    </Route>
                    <Route element={<RequireAuth roles={["landlord"]} />}>
                        <Route path="dashboard" element={<LandlordDashboard />} />
                        <Route path="listings" element={<MyProperties />} />
                        <Route path="listings/new" element={<PropertyForm />} />
                        <Route path="listings/:id/edit" element={<PropertyForm />} />
                        <Route path="listings/:id/media" element={<MediaFloorplans />} />
                        <Route path="listings/:id/claims" element={<ListingClaims />} />
                        <Route path="listings/viewings" element={<ViewingManagement />} />
                    </Route>
                    <Route element={<RequireAuth roles={TENANCY_ROLES} />}>
                        <Route path="agreements" element={<TenancyDashboard />} />
                        <Route path="agreements/:agreementId" element={<AgreementDetails />} />
                        <Route path="agreements/:agreementId/clauses" element={<ClausesAnnotations />} />
                        <Route path="agreements/:agreementId/evidence" element={<EvidenceGraph />} />
                        <Route path="agreements/:agreementId/condition" element={<ConditionReports />} />
                        <Route path="agreements/:agreementId/condition/compare" element={<ConditionComparison />} />
                        <Route path="agreements/:agreementId/maintenance" element={<Maintenance />} />
                        <Route path="agreements/:agreementId/cases" element={<DisputeCases />} />
                        <Route path="cases/:caseId" element={<CaseEvidenceReview />} />
                    </Route>
                    <Route element={<RequireAuth roles={["legal_reviewer"]} />}>
                        <Route path="cases" element={<CaseQueue />} />
                    </Route>
                    <Route element={<RequireAuth roles={["admin"]} signInPath="/admin/sign-in" />}>
                        <Route path="admin" element={<PlatformHealth />} />
                        <Route path="admin/audit-logs" element={<AuditTrail />} />
                        <Route path="admin/reviewers" element={<LegalReviewers />} />
                        <Route path="admin/ai-evaluations" element={<AIEvaluations />} />
                        <Route path="admin/ai-evaluations/:runId" element={<AIEvaluations />} />
                    </Route>
                </Route>
            </Route>
        </Routes>
    );
}
