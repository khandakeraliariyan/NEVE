import express from "express";
import cors from "cors";
import helmet from "helmet";

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

const app = express();

app.use(helmet());

app.use(
    cors({
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.use(express.json({ limit: "1mb" }));

// Health-check endpoint
app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Neve API is running",
    });
});

// API routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
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
app.use("/api/v1/uploads", fileUploadRoutes);

// Handle unknown routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
    });
});

// Central error handler
app.use((err, req, res, next) => {
    console.error("Server error:", err.message);

    res.status(500).json({
        success: false,
        message: "Internal server error",
    });
});

export default app;