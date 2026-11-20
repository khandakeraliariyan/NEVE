# API reference

This is every HTTP endpoint of the NEVE API, generated from `backend/src/routes/` (collected in `backend/src/routes/index.js`). For how requests are authenticated and checked, see [architecture.md](architecture.md). For what each feature does, see [features.md](features.md).

## Conventions

**Base URL.** Every path below is relative to `/api/v1`, for example `http://localhost:5000/api/v1`.

**Authentication.**
- Renters, landlords and legal reviewers send a Firebase ID token: `Authorization: Bearer <token>`.
- Admins use the httpOnly session cookie set by `POST /auth/admin/login`, and must send `X-Neve-Admin: 1` on every request (CSRF protection). An admin token sent any other way is refused.
- The API loads the user's current role and account status from MongoDB on every request, so a suspended account or a revoked session is refused straight away.

**Access column.**
- *Public*: no sign-in needed.
- A role list: only those roles may call the endpoint.
- Role checks only decide who may call an endpoint. Controllers also check access to the specific record: a participant of the agreement, the owner of the listing, someone the case is shared with, and so on. A matching role is necessary but not sufficient.

**Responses.** JSON with a `success` flag. Errors carry a `message`, and some carry a machine-readable `code`:

| Code | Meaning |
|---|---|
| `SESSION_REVOKED` | The session was signed out elsewhere. |
| `PERMISSION_DISABLED` | An admin turned the feature off for this role in platform settings. |
| `CSRF_CHECK_FAILED` | An admin request without `X-Neve-Admin: 1` or from another origin. |

Typical statuses: `400` invalid input; `401` not signed in; `403` wrong role, no access to the record, or a disabled feature; `404` not found or not visible to you; `409` conflicting state (for example a legal-source transition that isn't allowed); `429` rate limit; `503` an AI feature isn't configured or is busy (Groq's per-minute token limit); `502` the AI provider failed.

**Rate limits.** Counted per client IP over 15 minutes:

| Limit | Applies to |
|---|---|
| 100 requests | the whole API |
| 20 requests | `/auth` and `/users` |
| 120 requests | `/uploads` (a separate budget) |
| 10 requests | agreement extraction, risk analysis and legal suggestions (*AI rate limit*) |
| 10 requests | AI ranking of recommendations |
| 40 requests | Legal Copilot questions |

**Uploads.**
1. `POST /uploads/presign` with the purpose, file name, type and size returns a signed R2 URL.
2. The browser `PUT`s the file directly to R2.
3. `PATCH /uploads/:fileId/complete` checks the stored size, type and content signature, and records the SHA-256 hash.

Files are then referenced by `fileId`. Private files are opened through `GET /uploads/:fileId/access-url`, which returns a URL that expires after 5 minutes.

## Endpoints outside the route files

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Health check: `{"success":true,...}` |
| `GET` | `/platform` | Public | Public platform information: the announcement banner, support email and enabled features |
| `GET` | `/platform/privacy-policy` | Public | The published privacy policy |
| `GET` | `/cron/:task` | `Authorization: Bearer <CRON_SECRET>` | Runs a scheduled job (`notification_reminders`, `notification_digest`, `retention_purge`, `backup`, `notification_delivery`, or `all`) on serverless hosts. Returns `404` when `CRON_SECRET` isn't set. |

## Endpoints by area

The **Handler** column names the controller function in `backend/src/controllers/`, which is the place to look for the exact request and response fields. In **Notes**, *validated query* means the query string is checked against a Zod schema, and *role permission setting* means an admin can switch the feature off for a role.

The legal intelligence endpoints are under [`/tenancy`](#tenancy) (risk analysis, evidence graph, evidence flags, Risk Sentinel, legal suggestions), [`/copilot`](#copilot), [`/legal-sources`](#legal-sources) and [`/legal-review`](#legal-review).

### `/auth`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/auth/me` | Any signed-in user | `getCurrentUser` | auth rate limit |
| `POST` | `/auth/password-changed` | Any signed-in user | `reportPasswordChanged` | auth rate limit |
| `POST` | `/auth/admin/login` | Public | `adminLogin` | auth rate limit |
| `POST` | `/auth/admin/logout` | Public | `adminLogout` | auth rate limit |
| `POST` | `/auth/admin/setup` | Public | `completeAdminSetup` | auth rate limit |

### `/users`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `POST` | `/users/profile` | Any signed-in user | `createProfile` | user rate limit |
| `GET` | `/users/me` | Any signed-in user | `getMyProfile` | user rate limit |
| `PATCH` | `/users/me` | Any signed-in user | `updateMyProfile` | user rate limit |
| `PUT` | `/users/me/photo` | Any signed-in user | `setMyProfilePhoto` | user rate limit |
| `DELETE` | `/users/me/photo` | Any signed-in user | `removeMyProfilePhoto` | user rate limit |
| `GET` | `/users/me/sessions` | Any signed-in user with a role | `getMySessions` | user rate limit |
| `POST` | `/users/me/sessions/revoke-others` | Any signed-in user with a role | `revokeMyOtherSessions` | user rate limit |
| `DELETE` | `/users/me/sessions/:sessionId` | Any signed-in user with a role | `revokeMySession` | user rate limit |
| `GET` | `/users/me/login-history` | Any signed-in user with a role | `getMyLoginHistory` | user rate limit |
| `GET` | `/users/me/appeals` | renter, landlord, legal reviewer (suspended accounts too) | `getMyAppeals` | user rate limit |
| `POST` | `/users/me/appeals` | renter, landlord, legal reviewer (suspended accounts too) | `submitAppeal` | user rate limit |
| `GET` | `/users/lookup` | renter, landlord | `lookupUsers` | user rate limit |
| `POST` | `/users/me/favorites/:propertyId` | renter | `addFavorite` | user rate limit |
| `GET` | `/users/me/favorites` | renter | `getFavorites` | user rate limit |
| `DELETE` | `/users/me/favorites/:propertyId` | renter | `removeFavorite` | user rate limit |
| `POST` | `/users/me/recently-viewed/:propertyId` | renter | `recordPropertyView` | user rate limit |
| `GET` | `/users/me/recently-viewed` | renter | `getRecentlyViewed` | user rate limit |
| `DELETE` | `/users/me/recently-viewed/:propertyId` | renter | `removeRecentlyViewed` | user rate limit |
| `DELETE` | `/users/me/recently-viewed` | renter | `clearRecentlyViewed` | user rate limit |
| `GET` | `/users/:userId/photo` | Public | `getProfilePhoto` | user rate limit |
| `GET` | `/users/:userId/public` | Public | `getPublicProfile` | user rate limit |

### `/properties`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/properties/:propertyId/details` | Public | `getPropertyDetails` |  |
| `GET` | `/properties/:propertyId/transparency` | Public | `getPublicPropertyTransparency` |  |
| `GET` | `/properties` | Public | `getProperties` | validated query |
| `GET` | `/properties/recent` | Public | `getRecentProperties` | validated query |
| `GET` | `/properties/mine` | landlord | `getMyProperties` |  |
| `GET` | `/properties/mine/:id` | landlord | `getMyPropertyById` |  |
| `POST` | `/properties/compare` | Public | `compareProperties` |  |
| `GET` | `/properties/search` | Public | `searchProperties` | validated query |
| `GET` | `/properties/nearby` | Public | `searchNearbyProperties` | validated query |
| `GET` | `/properties/:id/costs` | Public | `getPropertyCosts` |  |
| `GET` | `/properties/:id/nearby` | Public | `getNearbyPlaces` |  |
| `GET` | `/properties/:id/route` | Public | `getPropertyRoute` |  |
| `GET` | `/properties/:id/travel-times` | Public | `getPropertyTravelTimes` |  |
| `GET` | `/properties/:id/neighborhood-insights` | Public | `getNeighborhoodInsights` |  |
| `GET` | `/properties/:id/detail` | Public | `getPropertyDetail` |  |
| `POST` | `/properties/:id/view-event` | renter | `recordPropertyViewEvent` |  |
| `GET` | `/properties/:id` | Public | `getPropertyById` |  |
| `POST` | `/properties` | landlord | `createProperty` |  |
| `PATCH` | `/properties/:id` | landlord | `updateProperty` |  |
| `DELETE` | `/properties/:id` | landlord | `deleteProperty` |  |
| `PATCH` | `/properties/:id/status` | landlord | `updatePropertyStatus` |  |

### `/property-trust`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/property-trust/:propertyId` | Public | `getPropertyTrustSummary` |  |

### `/inquiries`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `POST` | `/inquiries` | renter | `createInquiry` |  |
| `GET` | `/inquiries/mine` | renter | `getMyInquiries` |  |
| `GET` | `/inquiries/:inquiryId/messages` | renter, landlord | `getInquiryMessages` |  |
| `POST` | `/inquiries/:inquiryId/messages` | renter, landlord | `sendInquiryMessage` |  |
| `POST` | `/inquiries/:inquiryId/messages/:messageId/report` | renter, landlord | `reportInquiryMessage` |  |
| `GET` | `/inquiries/landlord` | landlord | `getNewLandlordInquiries` |  |
| `PATCH` | `/inquiries/:inquiryId/respond` | landlord | `respondToInquiry` |  |
| `GET` | `/inquiries/received` | landlord | `getLandlordInquiries` |  |
| `PATCH` | `/inquiries/:id` | landlord | `updateInquiry` |  |

### `/viewings`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `POST` | `/viewings` | renter | `createViewingRequest` |  |
| `GET` | `/viewings/mine` | renter | `getMyViewingRequests` |  |
| `PATCH` | `/viewings/:viewingId/cancel` | renter | `cancelViewing` |  |
| `GET` | `/viewings/my-requests` | renter | `getDedicatedMyViewingRequests` |  |
| `PATCH` | `/viewings/:viewingId/reschedule` | renter, landlord | `rescheduleViewing` |  |
| `PATCH` | `/viewings/:viewingId/landlord-cancel` | landlord | `cancelViewing` |  |
| `GET` | `/viewings/landlord` | landlord | `getDedicatedLandlordViewingRequests` |  |
| `PATCH` | `/viewings/:viewingId/respond` | landlord | `respondToViewingRequest` |  |
| `PATCH` | `/viewings/:viewingId/complete` | landlord | `completeViewingRequest` |  |
| `GET` | `/viewings/received` | landlord | `getLandlordViewingRequests` |  |
| `PATCH` | `/viewings/:id` | landlord | `updateViewingRequest` |  |

### `/matching`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `POST` | `/matching/recommendations` | renter | `getRecommendations` |  |

### `/reviews`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/reviews/properties/:propertyId` | Public | `getPropertyReviews` |  |
| `POST` | `/reviews/properties/:propertyId` | renter | `createReview` |  |
| `PATCH` | `/reviews/:reviewId` | renter | `updateReview` |  |
| `DELETE` | `/reviews/:reviewId` | renter | `deleteReview` |  |
| `PUT` | `/reviews/:reviewId/reply` | landlord | `upsertReviewReply` |  |
| `DELETE` | `/reviews/:reviewId/reply` | landlord | `deleteReviewReply` |  |

### `/review-moderation`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `POST` | `/review-moderation/:reviewId/reports` | renter | `reportReview` |  |
| `GET` | `/review-moderation/reports` | admin | `getReviewReports` |  |
| `PATCH` | `/review-moderation/reports/:reportId` | admin | `resolveReviewReport` |  |
| `PATCH` | `/review-moderation/:reviewId/moderation` | admin | `moderateReview` |  |

### `/landlord/dashboard`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/landlord/dashboard/properties` | landlord | `getLandlordDashboard` |  |
| `GET` | `/landlord/dashboard/performance` | landlord | `getLandlordPerformance` |  |

### `/notifications`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/notifications/unsubscribe` | Public | `showUnsubscribe` |  |
| `POST` | `/notifications/unsubscribe` | Public | `confirmUnsubscribe` |  |
| `GET` | `/notifications/preferences` | renter, landlord, legal reviewer, admin | `getNotificationPreferences` |  |
| `PATCH` | `/notifications/preferences` | renter, landlord, legal reviewer, admin | `updateNotificationPreferences` |  |
| `GET` | `/notifications/unread-count` | renter, landlord, legal reviewer, admin | `getUnreadCount` |  |
| `PATCH` | `/notifications/read-all` | renter, landlord, legal reviewer, admin | `markAllNotificationsAsRead` |  |
| `GET` | `/notifications` | renter, landlord, legal reviewer, admin | `getMyNotifications` |  |
| `PATCH` | `/notifications/:id/read` | renter, landlord, legal reviewer, admin | `markNotificationAsRead` |  |

### `/property-reports`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `POST` | `/property-reports` | renter, landlord | `createPropertyReport` |  |
| `GET` | `/property-reports/my-reports` | renter, landlord | `getMyPropertyReports` |  |
| `GET` | `/property-reports/my-listings` | landlord | `getReportsAboutMyListings` |  |
| `POST` | `/property-reports/:reportId/response` | landlord | `respondToPropertyReport` |  |
| `GET` | `/property-reports/admin` | admin | `getPropertyReportsForReview` |  |
| `PATCH` | `/property-reports/admin/:reportId` | admin | `reviewPropertyReport` |  |

### `/duplicate-listings`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/duplicate-listings/:propertyId/duplicate-check` | admin | `checkDuplicateListings` |  |

### `/property-images`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/property-images/:propertyId` | Public | `getPropertyImages` |  |
| `GET` | `/property-images/:propertyId/thumbnail` | Public | `getPropertyThumbnail` |  |
| `POST` | `/property-images/:propertyId/:fileId/attach` | landlord, admin | `attachPropertyImage` |  |
| `DELETE` | `/property-images/:propertyId/:fileId` | landlord, admin | `removePropertyImage` |  |

### `/nearby-places`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/nearby-places/:propertyId` | Public | `getPropertyNearbyPlaces` |  |

### `/uploads`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `POST` | `/uploads/presign` | renter, landlord, legal reviewer, admin | `requestUploadUrl` | upload rate limit |
| `PATCH` | `/uploads/:fileId/complete` | renter, landlord, legal reviewer, admin | `completeUpload` | upload rate limit |
| `GET` | `/uploads/:fileId/access-url` | renter, landlord, legal reviewer, admin | `getFileAccessUrl` | upload rate limit |

### `/saved-properties`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/saved-properties` | renter | `getSavedProperties` | validated query |
| `POST` | `/saved-properties/:propertyId` | renter | `saveProperty` |  |
| `DELETE` | `/saved-properties/:propertyId` | renter | `unsaveProperty` |  |

### `/saved-searches`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/saved-searches` | renter | `listSavedSearches` |  |
| `POST` | `/saved-searches` | renter | `createSavedSearch` |  |
| `GET` | `/saved-searches/:searchId` | renter | `getSavedSearch` |  |
| `PATCH` | `/saved-searches/:searchId` | renter | `updateSavedSearch` |  |
| `DELETE` | `/saved-searches/:searchId` | renter | `deleteSavedSearch` |  |

### `/renter-preferences`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/renter-preferences` | renter | `getRenterPreferences` |  |
| `PUT` | `/renter-preferences` | renter | `updateRenterPreferences` |  |

### `/recommendations`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/recommendations` | renter | `getPersonalizedRecommendations` |  |
| `GET` | `/recommendations/ai-ranking` | renter | `getAIRanking` |  |
| `POST` | `/recommendations/ai-ranking` | renter | `runAIRanking` | AI rate limit |

### `/listing-consistency`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/listing-consistency/warnings/mine` | landlord | `listMyListingWarnings` |  |
| `POST` | `/listing-consistency/warnings/:warningId/appeal` | landlord | `appealListingWarning` |  |
| `GET` | `/listing-consistency/:propertyId` | landlord, admin | `reviewListingConsistency` |  |
| `PATCH` | `/listing-consistency/warnings/:warningId` | admin | `updateListingWarningStatus` |  |

### `/evidence-graph`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `POST` | `/evidence-graph/properties/:propertyId/claims` | landlord, admin | `createPropertyClaim` |  |
| `POST` | `/evidence-graph/properties/:propertyId/claims/:claimId/evidence` | landlord, admin | `attachClaimEvidence` |  |
| `PATCH` | `/evidence-graph/properties/:propertyId/evidence/:linkId` | landlord, admin | `updateClaimEvidenceLink` |  |
| `GET` | `/evidence-graph/properties/:propertyId` | landlord, admin | `getPropertyEvidenceGraph` |  |
| `PATCH` | `/evidence-graph/claims/:claimId/review` | admin | `reviewPropertyClaim` |  |

### `/tenancy`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `POST` | `/tenancy/agreements` | renter, landlord | `createTenancyAgreement` |  |
| `GET` | `/tenancy/compliance` | renter, landlord, legal reviewer | `getMyCompliance` |  |
| `GET` | `/tenancy/risk-sentinel` | renter, landlord, legal reviewer | `getRiskSentinel` |  |
| `GET` | `/tenancy/agreements/:agreementId/compliance` | renter, landlord, legal reviewer | `getAgreementCompliance` |  |
| `POST` | `/tenancy/agreements/:agreementId/proposed-obligations/:proposalId/accept` | renter, landlord | `acceptProposedObligation` |  |
| `POST` | `/tenancy/agreements/:agreementId/proposed-obligations/:proposalId/dismiss` | renter, landlord | `dismissProposedObligation` |  |
| `POST` | `/tenancy/invitations` | landlord | `inline` | role permission setting |
| `GET` | `/tenancy/invitations` | renter, landlord | `listInvitations` |  |
| `GET` | `/tenancy/invitations/:invitationId` | renter, landlord | `getInvitation` |  |
| `POST` | `/tenancy/invitations/:invitationId/accept` | renter, landlord | `acceptInvitation` |  |
| `POST` | `/tenancy/invitations/:invitationId/decline` | renter, landlord | `declineInvitation` |  |
| `POST` | `/tenancy/invitations/:invitationId/cancel` | landlord | `cancelInvitation` |  |
| `PATCH` | `/tenancy/agreements/:agreementId/document` | renter, landlord | `attachAgreementDocument` |  |
| `GET` | `/tenancy/agreements` | renter, landlord, legal reviewer | `listTenancyAgreements` |  |
| `GET` | `/tenancy/agreements/:agreementId/cases` | renter, landlord, legal reviewer | `listTenancyCases` |  |
| `POST` | `/tenancy/agreements/:agreementId/cases` | renter, landlord | `createTenancyCase` |  |
| `GET` | `/tenancy/cases` | legal reviewer | `listSharedTenancyCases` |  |
| `GET` | `/tenancy/cases/:caseId` | renter, landlord, legal reviewer | `getTenancyCase` |  |
| `GET` | `/tenancy/cases/:caseId/report` | renter, landlord, legal reviewer | `getTenancyCaseReport` |  |
| `POST` | `/tenancy/cases/:caseId/evidence` | renter, landlord, legal reviewer | `addCaseEvidence` |  |
| `DELETE` | `/tenancy/cases/:caseId/evidence/:fileId` | renter, landlord, legal reviewer | `removeCaseEvidence` |  |
| `POST` | `/tenancy/cases/:caseId/shares` | renter, landlord | `shareTenancyCase` |  |
| `DELETE` | `/tenancy/cases/:caseId/shares/:userId` | renter, landlord | `revokeTenancyCaseShare` |  |
| `POST` | `/tenancy/cases/:caseId/review-entries` | renter, landlord, legal reviewer | `addCaseReviewEntry` |  |
| `POST` | `/tenancy/cases/:caseId/statements` | renter, landlord | `addCaseStatement` |  |
| `PATCH` | `/tenancy/cases/:caseId/statements/:statementId` | renter, landlord | `updateCaseStatement` |  |
| `POST` | `/tenancy/cases/:caseId/issues` | renter, landlord | `addCaseIssue` |  |
| `DELETE` | `/tenancy/cases/:caseId/issues/:issueId` | renter, landlord | `removeCaseIssue` |  |
| `PATCH` | `/tenancy/cases/:caseId/status` | renter, landlord | `updateTenancyCaseStatus` |  |
| `POST` | `/tenancy/agreements/:agreementId/condition-reports/:stage` | renter, landlord, legal reviewer | `createConditionReport` |  |
| `POST` | `/tenancy/agreements/:agreementId/condition-reports/:reportId/entries` | renter, landlord, legal reviewer | `addConditionEntry` |  |
| `POST` | `/tenancy/agreements/:agreementId/condition-reports/:reportId/entries/:entryId/corrections` | renter, landlord, legal reviewer | `correctConditionEntry` |  |
| `POST` | `/tenancy/agreements/:agreementId/condition-reports/:reportId/entries/:entryId/reviews` | renter, landlord, legal reviewer | `reviewConditionEntry` |  |
| `GET` | `/tenancy/agreements/:agreementId/condition-comparison` | renter, landlord, legal reviewer | `getConditionComparison` |  |
| `GET` | `/tenancy/agreements/:agreementId/condition-reports` | renter, landlord, legal reviewer | `listConditionReports` |  |
| `GET` | `/tenancy/maintenance-requests` | renter, landlord, legal reviewer | `listMaintenanceRequests` |  |
| `POST` | `/tenancy/agreements/:agreementId/maintenance-requests` | renter, landlord, legal reviewer | `createMaintenanceRequest` |  |
| `PATCH` | `/tenancy/maintenance-requests/:requestId/progress` | renter, landlord, legal reviewer | `updateMaintenanceRequest` |  |
| `PATCH` | `/tenancy/maintenance-requests/:requestId/assignee` | landlord | `assignMaintenanceRequest` |  |
| `GET` | `/tenancy/agreements/:agreementId/evidence-graph` | renter, landlord, legal reviewer | `getAgreementEvidenceGraph` |  |
| `GET` | `/tenancy/agreements/:agreementId/integrity` | renter, landlord, legal reviewer | `getAgreementIntegrity` |  |
| `GET` | `/tenancy/agreements/:agreementId/evidence-report` | renter, landlord, legal reviewer | `getAgreementEvidenceReport` |  |
| `POST` | `/tenancy/agreements/:agreementId/evidence-links` | renter, landlord | `addAgreementEvidenceLink` |  |
| `PATCH` | `/tenancy/agreements/:agreementId/evidence-flags` | renter, landlord | `reviewEvidenceFlag` |  |
| `PATCH` | `/tenancy/agreements/:agreementId/evidence-links/:linkId` | renter, landlord, legal reviewer | `updateAgreementEvidenceLink` |  |
| `POST` | `/tenancy/agreements/:agreementId/evidence-links/suggest` | renter, landlord | `suggestAgreementEvidenceLinks` |  |
| `PATCH` | `/tenancy/agreements/:agreementId/evidence-links/:linkId/review` | renter, landlord | `reviewSuggestedEvidenceLink` |  |
| `POST` | `/tenancy/agreements/:agreementId/evidence-links/:linkId/confirm` | renter, landlord | `confirmAgreementEvidenceLink` |  |
| `POST` | `/tenancy/agreements/:agreementId/legal-links` | renter, landlord | `addAgreementLegalLink` |  |
| `GET` | `/tenancy/agreements/:agreementId/legal-suggestions` | renter, landlord, legal reviewer | `listLegalSuggestions` |  |
| `POST` | `/tenancy/agreements/:agreementId/legal-suggestions` | renter, landlord | `runLegalSuggestions` | AI rate limit |
| `PATCH` | `/tenancy/agreements/:agreementId/legal-suggestions/:suggestionId` | renter, landlord | `reviewLegalSuggestion` |  |
| `GET` | `/tenancy/agreements/:agreementId/clauses/:clauseId/legal-sources` | renter, landlord, legal reviewer | `listClauseLegalSources` |  |
| `POST` | `/tenancy/agreements/:agreementId/clauses/:clauseId/rewrite-suggestions` | renter, landlord | `suggestClauseRewrite` |  |
| `PATCH` | `/tenancy/agreements/:agreementId/clauses/:clauseId/rewrite-suggestions/:suggestionId/response` | renter, landlord | `respondToClauseRewrite` |  |
| `PATCH` | `/tenancy/agreements/:agreementId/clauses/:clauseId/rewrite-suggestions/:suggestionId/assessment` | legal reviewer | `assessClauseRewrite` |  |
| `GET` | `/tenancy/agreements/:agreementId/documents` | renter, landlord, legal reviewer | `listDocuments` |  |
| `POST` | `/tenancy/agreements/:agreementId/documents` | renter, landlord | `createDocument` |  |
| `PATCH` | `/tenancy/agreements/:agreementId/documents/:documentId` | renter, landlord | `updateDocument` |  |
| `POST` | `/tenancy/agreements/:agreementId/documents/:documentId/versions` | renter, landlord | `addDocumentVersion` |  |
| `POST` | `/tenancy/agreements/:agreementId/documents/:documentId/respond` | renter, landlord | `respondToDocument` |  |
| `GET` | `/tenancy/agreements/:agreementId/documents/:documentId/versions/:version/access-url` | renter, landlord, legal reviewer | `getDocumentVersionUrl` |  |
| `GET` | `/tenancy/agreements/:agreementId/risk-analysis` | renter, landlord, legal reviewer | `getRiskAnalysis` |  |
| `POST` | `/tenancy/agreements/:agreementId/risk-analysis` | renter, landlord | `runRiskAnalysis` | AI rate limit |
| `PATCH` | `/tenancy/agreements/:agreementId/risk-analysis/findings/:findingId` | renter, landlord, legal reviewer | `updateRiskFinding` |  |
| `GET` | `/tenancy/agreements/:agreementId/analysis-report` | renter, landlord, legal reviewer | `downloadAnalysisReport` |  |
| `POST` | `/tenancy/agreements/:agreementId/record-links` | renter, landlord | `addAgreementRecordLink` |  |
| `DELETE` | `/tenancy/agreements/:agreementId/record-links/:linkId` | renter, landlord | `removeAgreementRecordLink` |  |
| `POST` | `/tenancy/agreements/:agreementId/clauses` | renter, landlord | `addAgreementClause` |  |
| `POST` | `/tenancy/agreements/:agreementId/extract` | renter, landlord | `extractAgreement` | AI rate limit |
| `PATCH` | `/tenancy/agreements/:agreementId/clauses/:clauseId/review` | renter, landlord | `reviewAgreementClause` |  |
| `POST` | `/tenancy/agreements/:agreementId/obligations` | renter, landlord | `addAgreementObligation` |  |
| `PATCH` | `/tenancy/agreements/:agreementId/obligations/:obligationId` | renter, landlord | `updateAgreementObligation` |  |
| `POST` | `/tenancy/agreements/:agreementId/payments` | renter, landlord | `addAgreementPayment` |  |
| `PATCH` | `/tenancy/agreements/:agreementId/payments/:paymentId` | renter, landlord | `updateAgreementPayment` |  |
| `POST` | `/tenancy/agreements/:agreementId/shares` | renter, landlord | `shareAgreement` |  |
| `DELETE` | `/tenancy/agreements/:agreementId/shares/:userId` | renter, landlord | `revokeAgreementShare` |  |
| `PATCH` | `/tenancy/agreements/:agreementId/status` | renter, landlord | `updateTenancyAgreementStatus` |  |
| `GET` | `/tenancy/agreements/:agreementId` | renter, landlord, legal reviewer | `getTenancyAgreement` |  |

### `/admin/dashboard`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/admin/dashboard/overview` | admin | `getAdminOverview` |  |
| `GET` | `/admin/dashboard/reports` | admin | `getAdminReports` |  |
| `GET` | `/admin/dashboard/warnings` | admin | `getAdminWarnings` |  |
| `GET` | `/admin/dashboard/claims` | admin | `getAdminClaims` |  |
| `GET` | `/admin/dashboard/ai-usage` | admin | `getAIUsage` |  |
| `GET` | `/admin/dashboard/communication-reports` | admin | `getCommunicationReports` |  |

### `/admin/moderation`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `PATCH` | `/admin/moderation/reports/:reportId/status` | admin | `updateReportStatus` |  |
| `PATCH` | `/admin/moderation/communication-reports/:reportId/status` | admin | `updateCommunicationReportStatus` |  |
| `PATCH` | `/admin/moderation/warnings/:warningId/status` | admin | `updateWarningStatus` |  |
| `PATCH` | `/admin/moderation/warnings/:warningId/appeal` | admin | `decideListingAppeal` |  |
| `PATCH` | `/admin/moderation/warnings/:warningId/public-visibility` | admin | `updateWarningPublicSummary` |  |
| `PATCH` | `/admin/moderation/claims/:claimId/review` | admin | `reviewPropertyClaim` |  |
| `PATCH` | `/admin/moderation/claims/:claimId/public-visibility` | admin | `updateClaimPublicSummary` |  |
| `GET` | `/admin/moderation/listings/:propertyId` | admin | `getListingModeration` |  |
| `PATCH` | `/admin/moderation/listings/:propertyId/suspension` | admin | `changeListingSuspension` |  |

### `/admin/audit-logs`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/admin/audit-logs/integrity` | admin | `getAuditLogIntegrity` |  |
| `GET` | `/admin/audit-logs` | admin | `getAdminAuditLogs` |  |

### `/admin/users`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/admin/users` | admin | `listUsers` |  |
| `GET` | `/admin/users/appeals` | admin | `listAppeals` |  |
| `PATCH` | `/admin/users/appeals/:appealId` | admin | `decideAppeal` |  |
| `POST` | `/admin/users/staff` | admin | `createStaffAccount` |  |
| `POST` | `/admin/users/:userId/setup-link` | admin | `renewAdminSetupLink` |  |
| `PATCH` | `/admin/users/:userId/role` | admin | `changeReviewerRole` |  |
| `PATCH` | `/admin/users/:userId/status` | admin | `changeAccountStatus` |  |

### `/admin/trust-approval`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `PATCH` | `/admin/trust-approval/claims/:claimId/public-summary` | admin | `approveClaimSummary` |  |
| `PATCH` | `/admin/trust-approval/warnings/:warningId/public-summary` | admin | `approveWarningSummary` |  |

### `/privacy`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/privacy/export` | renter, landlord, legal reviewer, admin | `exportMyData` |  |
| `GET` | `/privacy/account-deletion` | renter, landlord, legal reviewer, admin | `getAccountDeletionInfo` |  |
| `POST` | `/privacy/account-deletion` | renter, landlord, legal reviewer, admin | `deleteMyAccount` |  |
| `GET` | `/privacy/documents` | renter, landlord, legal reviewer, admin | `listMyDeletableDocuments` |  |
| `GET` | `/privacy/documents/deletion-requests` | renter, landlord, legal reviewer, admin | `listMyDocumentDeletionRequests` |  |
| `POST` | `/privacy/documents/:fileId/deletion-requests` | renter, landlord, legal reviewer, admin | `requestDocumentDeletion` |  |

### `/admin/privacy`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/admin/privacy/deletion-requests` | admin | `listDocumentDeletionRequests` |  |
| `PATCH` | `/admin/privacy/deletion-requests/:requestId` | admin | `reviewDocumentDeletionRequest` |  |
| `GET` | `/admin/privacy/retention-due` | admin | `listRetentionDueDocuments` |  |
| `PATCH` | `/admin/privacy/files/:fileId/retention` | admin | `updateDocumentRetention` |  |
| `GET` | `/admin/privacy/access-logs` | admin | `listSensitiveAccessLogs` |  |

### `/admin/ai-evaluations`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `POST` | `/admin/ai-evaluations/runs` | admin | `createAIEvaluationRun` |  |
| `GET` | `/admin/ai-evaluations/runs` | admin, legal reviewer | `listAIEvaluationRuns` | reviewer access setting |
| `GET` | `/admin/ai-evaluations/runs/:runId` | admin, legal reviewer | `getAIEvaluationRun` | reviewer access setting |

### `/verification`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/verification/me` | renter, landlord, legal reviewer | `getMyVerification` |  |
| `POST` | `/verification/contact/sync` | renter, landlord, legal reviewer | `syncContactVerification` |  |
| `GET` | `/verification/requests` | renter, landlord, legal reviewer | `listMyVerificationRequests` |  |
| `POST` | `/verification/requests` | renter, landlord, legal reviewer | `submitVerificationRequest` |  |
| `PATCH` | `/verification/requests/:requestId/cancel` | renter, landlord, legal reviewer | `cancelMyVerificationRequest` |  |

### `/admin/verifications`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/admin/verifications` | admin | `adminListVerificationRequests` |  |
| `GET` | `/admin/verifications/:requestId` | admin | `adminGetVerificationRequest` |  |
| `PATCH` | `/admin/verifications/:requestId` | admin | `adminReviewVerificationRequest` |  |

### `/admin/system`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/admin/system/health` | admin | `getSystemHealth` |  |
| `GET` | `/admin/system/jobs` | admin | `listSystemJobRuns` |  |
| `GET` | `/admin/system/errors` | admin | `listSystemErrors` |  |
| `PATCH` | `/admin/system/errors/:errorId` | admin | `updateSystemError` |  |
| `POST` | `/admin/system/retention-purge` | admin | `runRetentionPurgeNow` |  |
| `POST` | `/admin/system/backups` | admin | `runBackupNow` |  |
| `POST` | `/admin/system/notification-reminders` | admin | `runNotificationRemindersNow` |  |
| `POST` | `/admin/system/photo-hash-backfill` | admin | `runPhotoHashBackfillNow` |  |
| `POST` | `/admin/system/notification-digest` | admin | `runNotificationDigestNow` |  |
| `GET` | `/admin/system/notification-deliveries/summary` | admin | `getNotificationDeliverySummary` |  |
| `GET` | `/admin/system/notification-deliveries` | admin | `listNotificationDeliveries` |  |
| `POST` | `/admin/system/notification-deliveries/:deliveryId/retry` | admin | `retryNotificationDelivery` |  |

### `/legal-sources`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/legal-sources` | Public | `getLegalSourcePack` |  |
| `GET` | `/legal-sources/jurisdictions` | Public | `listLegalSourceJurisdictions` |  |
| `GET` | `/legal-sources/search` | Public | `searchLegalSources` |  |

### `/admin/legal-sources`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/admin/legal-sources/outdated-citations` | admin | `getOutdatedCitations` |  |
| `GET` | `/admin/legal-sources/reviewer-activity` | admin | `getReviewerActivity` |  |
| `GET` | `/admin/legal-sources` | admin | `listLegalSourcesForStaff` |  |
| `POST` | `/admin/legal-sources` | admin | `createLegalSource` |  |
| `GET` | `/admin/legal-sources/:sourceId` | admin | `getLegalSourceForStaff` |  |
| `PATCH` | `/admin/legal-sources/:sourceId` | admin | `updateLegalSource` |  |
| `PATCH` | `/admin/legal-sources/:sourceId/status` | admin | `transitionLegalSource` |  |
| `PATCH` | `/admin/legal-sources/:sourceId/assignment` | admin | `assignLegalSource` |  |
| `PATCH` | `/admin/legal-sources/:sourceId/flags/:flagId` | admin | `resolveLegalSourceFlag` |  |

### `/legal-review`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/legal-review/citations/outdated` | legal reviewer | `getOutdatedCitations` |  |
| `GET` | `/legal-review/sources` | legal reviewer | `listLegalSourcesForStaff` |  |
| `POST` | `/legal-review/sources` | legal reviewer | `createLegalSource` | reviewer with drafting rights |
| `GET` | `/legal-review/sources/:sourceId` | legal reviewer | `getLegalSourceForStaff` |  |
| `PATCH` | `/legal-review/sources/:sourceId/content` | legal reviewer | `updateLegalSource` | reviewer with drafting rights |
| `PATCH` | `/legal-review/sources/:sourceId` | legal reviewer | `transitionLegalSource` |  |
| `POST` | `/legal-review/sources/:sourceId/flags` | legal reviewer | `flagLegalSource` |  |
| `PATCH` | `/legal-review/sources/:sourceId/flags/:flagId` | legal reviewer | `resolveLegalSourceFlag` |  |
| `GET` | `/legal-review/copilot/reports` | legal reviewer | `listReportedAnswers` |  |
| `PATCH` | `/legal-review/copilot/reports/:conversationId/:messageId` | legal reviewer | `reviewReportedAnswer` |  |
| `GET` | `/legal-review/copilot/quality` | legal reviewer | `copilotQualitySummary` |  |

### `/copilot`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/copilot/sources/:legalSourceId/sections/:sectionId` | renter, landlord, legal reviewer | `getCitedSection` | role permission setting |
| `GET` | `/copilot/conversations` | renter, landlord, legal reviewer | `listConversations` | role permission setting |
| `POST` | `/copilot/conversations` | renter, landlord, legal reviewer | `createConversation` | role permission setting |
| `GET` | `/copilot/conversations/:conversationId` | renter, landlord, legal reviewer | `getConversation` | role permission setting |
| `PATCH` | `/copilot/conversations/:conversationId` | renter, landlord, legal reviewer | `renameConversation` | role permission setting |
| `DELETE` | `/copilot/conversations/:conversationId` | renter, landlord, legal reviewer | `deleteConversation` | role permission setting |
| `GET` | `/copilot/conversations/:conversationId/export` | renter, landlord, legal reviewer | `exportConversationText` | role permission setting |
| `POST` | `/copilot/conversations/:conversationId/messages` | renter, landlord, legal reviewer | `askQuestion` | AI rate limit; role permission setting |
| `PATCH` | `/copilot/conversations/:conversationId/messages/:messageId/report` | renter, landlord, legal reviewer | `reportAnswer` | role permission setting |

### `/admin/security`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/admin/security/overview` | admin | `getSecurityOverview` |  |
| `GET` | `/admin/security/auth-events` | admin | `listAuthEvents` |  |
| `GET` | `/admin/security/incidents` | admin | `listIncidents` |  |
| `POST` | `/admin/security/incidents` | admin | `createIncident` |  |
| `PATCH` | `/admin/security/incidents/:incidentId` | admin | `updateIncident` |  |

### `/admin`


| Method | Path | Access | Handler | Notes |
|---|---|---|---|---|
| `GET` | `/admin/settings` | admin | `getPlatformSettings` |  |
| `PATCH` | `/admin/settings` | admin | `updatePlatformSettings` |  |
| `GET` | `/admin/email-templates` | admin | `listEmailTemplates` |  |
| `PUT` | `/admin/email-templates/:type` | admin | `updateEmailTemplate` |  |
| `DELETE` | `/admin/email-templates/:type` | admin | `resetEmailTemplate` |  |
| `POST` | `/admin/email-templates/:type/preview` | admin | `previewEmailTemplate` |  |
