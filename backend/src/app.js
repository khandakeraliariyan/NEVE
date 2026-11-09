import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import {
    apiLimiter,
    authLimiter,
    userLimiter,
    uploadLimiter,
} from "./middleware/rateLimit.middleware.js";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import propertyRoutes from "./routes/property.routes.js";
import inquiryRoutes from "./routes/inquiry.routes.js";
import viewingRoutes from "./routes/viewing.routes.js";
import matchingRoutes from "./routes/matching.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import reviewModerationRoutes from "./routes/reviewModeration.routes.js";
import landlordDashboardRoutes from "./routes/landlordDashboard.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import propertyReportRoutes from "./routes/propertyReport.routes.js";
import duplicateListingRoutes from "./routes/duplicateListing.routes.js";
import propertyImageRoutes from "./routes/propertyImage.routes.js";
import nearbyPlacesRoutes from "./routes/nearbyPlaces.routes.js";
import fileUploadRoutes from "./routes/fileUpload.routes.js";
import savedPropertyRoutes from "./routes/savedProperty.routes.js";
import savedSearchRoutes from "./routes/savedSearch.routes.js";
import renterPreferenceRoutes from "./routes/renterPreference.routes.js";
import propertyMatchingRoutes from "./routes/propertyMatching.routes.js";
import propertyDetailRoutes from "./routes/propertyDetail.routes.js";
import propertyTrustRoutes from "./routes/propertyTrust.routes.js";
import listingConsistencyRoutes from "./routes/listingConsistency.routes.js";
import evidenceGraphRoutes from "./routes/evidenceGraph.routes.js";
import tenancyAgreementRoutes from "./routes/tenancyAgreement.routes.js";
import adminDashboardRoutes from "./routes/adminDashboard.routes.js";
import adminModerationRoutes from "./routes/adminModeration.routes.js";
import adminAuditRoutes from "./routes/adminAudit.routes.js";
import adminUserRoutes from "./routes/adminUser.routes.js";
import adminTrustApprovalRoutes from "./routes/adminTrustApproval.routes.js";
import privacyRoutes from "./routes/privacy.routes.js";
import adminPrivacyRoutes from "./routes/adminPrivacy.routes.js";
import aiEvaluationRoutes from "./routes/aiEvaluation.routes.js";
import verificationRoutes from "./routes/verification.routes.js";
import adminVerificationRoutes from "./routes/adminVerification.routes.js";
import adminSystemRoutes from "./routes/adminSystem.routes.js";
import legalSourceRoutes from "./routes/legalSource.routes.js";
import adminLegalSourceRoutes from "./routes/adminLegalSource.routes.js";
import legalReviewRoutes from "./routes/legalReview.routes.js";
import platformSettingsRoutes from "./routes/platformSettings.routes.js";
import { getPublicPlatformInfo } from "./controllers/platformSettings.controller.js";

const app = express();

app.disable("x-powered-by");

app.use(helmet());

// CORS runs first so preflights don't count against the rate limit and browsers
// can read 429 responses.
app.use(
    cors({
        origin: env.CLIENT_URL,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.use("/api/v1", apiLimiter);

app.use(express.json({ limit: "1mb" }));

// Health-check endpoint
app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Neve API is running",
    });
});

// API routes
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/users", userLimiter, userRoutes);
app.use("/api/v1/properties", propertyDetailRoutes);
app.use("/api/v1/property-trust", propertyTrustRoutes);
app.use("/api/v1/properties", propertyRoutes);
app.use("/api/v1/inquiries", inquiryRoutes);
app.use("/api/v1/viewings", viewingRoutes);
app.use("/api/v1/matching", matchingRoutes);
app.use("/api/v1/reviews", reviewRoutes);
app.use("/api/v1/review-moderation", reviewModerationRoutes);
app.use("/api/v1/landlord/dashboard", landlordDashboardRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/property-reports", propertyReportRoutes);
app.use("/api/v1/duplicate-listings", duplicateListingRoutes);
app.use("/api/v1/property-images", propertyImageRoutes);
app.use("/api/v1/nearby-places", nearbyPlacesRoutes);
app.use("/api/v1/uploads", uploadLimiter, fileUploadRoutes);
app.use("/api/v1/saved-properties", savedPropertyRoutes);
app.use("/api/v1/saved-searches", savedSearchRoutes);
app.use("/api/v1/renter-preferences", renterPreferenceRoutes);
app.use("/api/v1/recommendations", propertyMatchingRoutes);
app.use("/api/v1/listing-consistency", listingConsistencyRoutes);
app.use("/api/v1/evidence-graph", evidenceGraphRoutes);
app.use("/api/v1/tenancy", tenancyAgreementRoutes);
app.use("/api/v1/admin/dashboard", adminDashboardRoutes);
app.use("/api/v1/admin/moderation", adminModerationRoutes);
app.use("/api/v1/admin/audit-logs", adminAuditRoutes);
app.use("/api/v1/admin/users", adminUserRoutes);
app.use("/api/v1/admin/trust-approval", adminTrustApprovalRoutes);
app.use("/api/v1/privacy", privacyRoutes);
app.use("/api/v1/admin/privacy", adminPrivacyRoutes);
app.use("/api/v1/admin/ai-evaluations", aiEvaluationRoutes);
app.use("/api/v1/verification", verificationRoutes);
app.use("/api/v1/admin/verifications", adminVerificationRoutes);
app.use("/api/v1/admin/system", adminSystemRoutes);
app.use("/api/v1/legal-sources", legalSourceRoutes);
app.use("/api/v1/admin/legal-sources", adminLegalSourceRoutes);
app.use("/api/v1/legal-review", legalReviewRoutes);
app.use("/api/v1/admin", platformSettingsRoutes);
// Public: announcement banner and sign-up options.
app.get("/api/v1/platform", getPublicPlatformInfo);

// Handle unknown routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
    });
});

// Central error handler
app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    console.error(error);

    const statusCode =
        Number.isInteger(error.status) &&
            error.status >= 400 &&
            error.status < 600
            ? error.status
            : 500;

    return res.status(statusCode).json({
        success: false,
        message:
            statusCode < 500
                ? error.message
                : "Internal server error.",
    });
});

export default app;