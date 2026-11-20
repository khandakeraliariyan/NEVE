import { getPrivacyPolicy, getPublicPlatformInfo } from "../controllers/platformSettings.controller.js";
import { runCronTask } from "../controllers/cron.controller.js";
import { buildEndpoints } from "../http/router.js";
import { authLimiter, uploadLimiter, userLimiter } from "../middleware/rateLimit.middleware.js";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import propertyRoutes from "./property.routes.js";
import inquiryRoutes from "./inquiry.routes.js";
import viewingRoutes from "./viewing.routes.js";
import matchingRoutes from "./matching.routes.js";
import reviewRoutes from "./review.routes.js";
import reviewModerationRoutes from "./reviewModeration.routes.js";
import landlordDashboardRoutes from "./landlordDashboard.routes.js";
import notificationRoutes from "./notification.routes.js";
import propertyReportRoutes from "./propertyReport.routes.js";
import duplicateListingRoutes from "./duplicateListing.routes.js";
import propertyImageRoutes from "./propertyImage.routes.js";
import nearbyPlacesRoutes from "./nearbyPlaces.routes.js";
import fileUploadRoutes from "./fileUpload.routes.js";
import savedPropertyRoutes from "./savedProperty.routes.js";
import savedSearchRoutes from "./savedSearch.routes.js";
import renterPreferenceRoutes from "./renterPreference.routes.js";
import propertyMatchingRoutes from "./propertyMatching.routes.js";
import propertyDetailRoutes from "./propertyDetail.routes.js";
import propertyTrustRoutes from "./propertyTrust.routes.js";
import listingConsistencyRoutes from "./listingConsistency.routes.js";
import evidenceGraphRoutes from "./evidenceGraph.routes.js";
import tenancyAgreementRoutes from "./tenancyAgreement.routes.js";
import adminDashboardRoutes from "./adminDashboard.routes.js";
import adminModerationRoutes from "./adminModeration.routes.js";
import adminAuditRoutes from "./adminAudit.routes.js";
import adminUserRoutes from "./adminUser.routes.js";
import adminTrustApprovalRoutes from "./adminTrustApproval.routes.js";
import privacyRoutes from "./privacy.routes.js";
import adminPrivacyRoutes from "./adminPrivacy.routes.js";
import aiEvaluationRoutes from "./aiEvaluation.routes.js";
import verificationRoutes from "./verification.routes.js";
import adminVerificationRoutes from "./adminVerification.routes.js";
import adminSystemRoutes from "./adminSystem.routes.js";
import legalSourceRoutes from "./legalSource.routes.js";
import adminLegalSourceRoutes from "./adminLegalSource.routes.js";
import legalReviewRoutes from "./legalReview.routes.js";
import platformSettingsRoutes from "./platformSettings.routes.js";
import legalCopilotRoutes from "./legalCopilot.routes.js";
import adminSecurityRoutes from "./adminSecurity.routes.js";

// Every API endpoint, in matching order: the first one whose method and path
// match a request handles it (see src/app/api/[...path]/route.js).
export const endpoints = buildEndpoints([
    {
        method: "GET",
        path: "/api/v1/health",
        handlers: [(req, res) => res.status(200).json({ success: true, message: "Neve API is running" })],
    },
    { prefix: "/api/v1/auth", middleware: [authLimiter], router: authRoutes },
    { prefix: "/api/v1/users", middleware: [userLimiter], router: userRoutes },
    { prefix: "/api/v1/properties", router: propertyDetailRoutes },
    { prefix: "/api/v1/property-trust", router: propertyTrustRoutes },
    { prefix: "/api/v1/properties", router: propertyRoutes },
    { prefix: "/api/v1/inquiries", router: inquiryRoutes },
    { prefix: "/api/v1/viewings", router: viewingRoutes },
    { prefix: "/api/v1/matching", router: matchingRoutes },
    { prefix: "/api/v1/reviews", router: reviewRoutes },
    { prefix: "/api/v1/review-moderation", router: reviewModerationRoutes },
    { prefix: "/api/v1/landlord/dashboard", router: landlordDashboardRoutes },
    { prefix: "/api/v1/notifications", router: notificationRoutes },
    { prefix: "/api/v1/property-reports", router: propertyReportRoutes },
    { prefix: "/api/v1/duplicate-listings", router: duplicateListingRoutes },
    { prefix: "/api/v1/property-images", router: propertyImageRoutes },
    { prefix: "/api/v1/nearby-places", router: nearbyPlacesRoutes },
    { prefix: "/api/v1/uploads", middleware: [uploadLimiter], router: fileUploadRoutes },
    { prefix: "/api/v1/saved-properties", router: savedPropertyRoutes },
    { prefix: "/api/v1/saved-searches", router: savedSearchRoutes },
    { prefix: "/api/v1/renter-preferences", router: renterPreferenceRoutes },
    { prefix: "/api/v1/recommendations", router: propertyMatchingRoutes },
    { prefix: "/api/v1/listing-consistency", router: listingConsistencyRoutes },
    { prefix: "/api/v1/evidence-graph", router: evidenceGraphRoutes },
    { prefix: "/api/v1/tenancy", router: tenancyAgreementRoutes },
    { prefix: "/api/v1/admin/dashboard", router: adminDashboardRoutes },
    { prefix: "/api/v1/admin/moderation", router: adminModerationRoutes },
    { prefix: "/api/v1/admin/audit-logs", router: adminAuditRoutes },
    { prefix: "/api/v1/admin/users", router: adminUserRoutes },
    { prefix: "/api/v1/admin/trust-approval", router: adminTrustApprovalRoutes },
    { prefix: "/api/v1/privacy", router: privacyRoutes },
    { prefix: "/api/v1/admin/privacy", router: adminPrivacyRoutes },
    { prefix: "/api/v1/admin/ai-evaluations", router: aiEvaluationRoutes },
    { prefix: "/api/v1/verification", router: verificationRoutes },
    { prefix: "/api/v1/admin/verifications", router: adminVerificationRoutes },
    { prefix: "/api/v1/admin/system", router: adminSystemRoutes },
    { prefix: "/api/v1/legal-sources", router: legalSourceRoutes },
    { prefix: "/api/v1/admin/legal-sources", router: adminLegalSourceRoutes },
    { prefix: "/api/v1/legal-review", router: legalReviewRoutes },
    { prefix: "/api/v1/copilot", router: legalCopilotRoutes },
    { prefix: "/api/v1/admin/security", router: adminSecurityRoutes },
    { prefix: "/api/v1/admin", router: platformSettingsRoutes },
    // Scheduled jobs on hosts without background timers (Vercel Cron); needs CRON_SECRET.
    { method: "GET", path: "/api/v1/cron/:task", handlers: [runCronTask] },
    // Public: announcement banner and sign-up options.
    { method: "GET", path: "/api/v1/platform", handlers: [getPublicPlatformInfo] },
    { method: "GET", path: "/api/v1/platform/privacy-policy", handlers: [getPrivacyPolicy] },
]);
