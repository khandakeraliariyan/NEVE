# NEVE Frontend Pages Specification

This document lists every page the NEVE frontend needs, who can use it, what it
contains, and which backend endpoints it calls.

- **Source:** the backend code in [`backend/src`](../backend/src), checked against
  the [backend README](../backend/README.md). Where the two disagree, this
  document follows the code.
- **Not covered:** the Neve Project Master Document is not in this repository, so
  features planned there without backend support may be missing.
- **Page routes are suggestions.** No frontend exists yet, so the URLs below can
  change. API paths are real and are relative to `/api/v1`.

## Contents

1. [Summary](#1-summary)
2. [Fix these backend problems first](#2-fix-these-backend-problems-first)
3. [Rules that apply to every page](#3-rules-that-apply-to-every-page)
4. [Public pages](#4-public-pages)
5. [Sign-in pages](#5-sign-in-pages)
6. [Renter pages](#6-renter-pages)
7. [Shared signed-in pages](#7-shared-signed-in-pages)
8. [Landlord and property manager pages](#8-landlord-and-property-manager-pages)
9. [Tenancy and dispute pages](#9-tenancy-and-dispute-pages)
10. [Admin pages](#10-admin-pages)
11. [System pages](#11-system-pages)
12. [Build order](#12-build-order)
13. [Features with no page yet](#13-features-with-no-page-yet)

---

## 1. Summary

The frontend needs **49 pages**, plus **1 proposed page** (User management) that
depends on new backend work.

| Area | Pages | Used by |
|---|---:|---|
| Public | 4 | Everyone |
| Sign-in | 4 | Everyone |
| Renter | 7 | Renter |
| Shared signed-in | 5 | Varies by page |
| Landlord and property manager | 7 | Landlord, property manager |
| Tenancy and disputes | 8 | Renter, landlord, property manager, legal reviewer |
| Admin | 12 | Admin |
| System | 2 | Everyone |
| **Total** | **49** | |

### What each role can reach

| Role | Pages |
|---|---|
| **Renter** | Public, renter, shared, tenancy |
| **Landlord** | Public, landlord, shared, tenancy |
| **Property manager** | Public, landlord (except Listing claims), shared (except Message thread), and tenancy for agreements they are assigned to |
| **Legal reviewer** | Notifications, Account, Privacy and data, and read-only tenancy pages for what is shared with them |
| **Admin** | Public, admin, Notifications, Account, Privacy and data. Admins have **no access** to tenancy pages, by design |

### Suggested landing page after sign-in

| Role | Lands on |
|---|---|
| Renter | `/recommendations` |
| Landlord, property manager | `/dashboard` |
| Legal reviewer | `/agreements` |
| Admin | `/admin` |

---

## 2. Fix these backend problems first

These block or limit specific pages. Each was confirmed in the code.

### Blocking

| # | Problem | Evidence | Pages affected | Fix |
|---|---|---|---|---|
| 1 | **Nobody can become a landlord, manager, reviewer or admin.** Every profile is created as `renter`, and no endpoint changes a role. | [`user.controller.js:34`](../backend/src/controllers/user.controller.js#L34) | All non-renter pages | Add a renter/landlord choice at sign-up, and an admin endpoint plus a User management page for staff roles |

### Fixed

| # | Problem | Now |
|---|---|---|
| 2 | Nobody could post a review | A `confirmed` or `completed` viewing makes a renter eligible |
| 3 | Users couldn't be looked up | `GET /users/lookup?type=manager\|reviewer&q=` |
| 4 | Case-only reviewers couldn't find their cases | `GET /tenancy/cases`, plus a `tenancy_case_shared` notification |
| 9 | Bulk uploads hit the rate limit | `/uploads` allows 120 requests per 15 minutes and no longer uses the general budget |

### Limiting

| # | Problem | Pages affected | Fix or workaround |
|---|---|---|---|
| 5 | **Profiles can't be edited.** There is no update endpoint for name, photo or phone. | Account | Add `PATCH /users/me`. Until then the page is read-only |
| 6 | **Property managers can't open message threads.** The routes allow only `renter` and `landlord`, and the handler checks those two people only. | Message thread, Received inquiries | Decide whether managers should message. If not, hide the link for them |
| 7 | **Inquiries have two separate status flows.** `PATCH /inquiries/:inquiryId/respond` takes `accepted`/`declined` and only from `pending`. `PATCH /inquiries/:id` takes `acknowledged`/`responded`/`closed`. | Received inquiries, Message thread | Agree one flow. This spec uses `/respond`, then `/:id` with `closed` |
| 8 | **Viewings can never be marked `completed`.** The status exists but no handler sets it. | My viewings, Received viewings | Add the transition, or hide the status |
| 10 | **Owners can't fetch one draft or paused listing.** `GET /properties/:id` returns published listings only. | Create/edit listing | Add an owner read endpoint. Until then, find it in the paginated `GET /landlord/dashboard/properties` list |

### Duplicate endpoints: use these

| Feature | Use | Avoid | Why |
|---|---|---|---|
| Saved listings | `/saved-properties` | `/users/me/favorites` | `/users` is limited to 20 requests per 15 minutes |
| Renter viewings | `GET /viewings/my-requests` | `GET /viewings/mine` | Supports a `status` filter |
| Received inquiries | `GET /inquiries/landlord` | `GET /inquiries/received` | Goes with the `/respond` flow |
| Received viewings | `GET /viewings/landlord`, `PATCH /viewings/:viewingId/respond` | `GET /viewings/received`, `PATCH /viewings/:id` | Supports a `status` filter |
| Property detail | `GET /properties/:id/detail` | Separate cost and image calls | Already includes costs and media, and saves requests |
| Report review | `PATCH /property-reports/admin/:reportId` | `PATCH /admin/moderation/reports/:reportId/status` | Also saves a review note, and writes an audit log |
| Public trust summaries | `/admin/trust-approval/*` | `/admin/moderation/*/public-visibility` | Checks that the record has been reviewed first |

---

## 3. Rules that apply to every page

### Authentication

- Use the Firebase client SDK for sign-in. Send the ID token on each request as
  `Authorization: Bearer <token>`.
- After sign-in, call `GET /users/me`. If no profile exists, send the user to
  [Complete profile](#complete-profile).
- Keep the user's role in app state. `GET /auth/me` returns Firebase identity
  only, not the NEVE role, and is limited to 20 requests per 15 minutes.
- Hide pages by role, but also handle `401`, `403` and `404` responses. The server
  makes the final decision.

### Rate limits

All of `/api/v1` allows 100 requests per 15 minutes from each client, not counting
`/uploads` or CORS preflights. `/auth` and `/users` also have a limit of 20 per 15
minutes. `/uploads` has its own limit of 120 per 15 minutes.

- Cache responses, and don't refetch when moving back to a page.
- Debounce search filters.
- Run user lookup when the user submits, not on each keystroke, because it counts
  against the `/users` limit.
- Poll `GET /notifications/unread-count` no more often than every few minutes.
- Show a friendly message on `429`.

### File uploads

All uploads use the same three steps, so build one shared component:

1. `POST /uploads/presign` with `{ purpose, originalName, mimeType, sizeBytes, propertyId? }`.
   The response includes `fileId` and `uploadUrl`.
2. `PUT` the file to `uploadUrl` with the returned `Content-Type` header.
3. `PATCH /uploads/:fileId/complete`.

| Purpose | Allowed types | Default max size |
|---|---|---:|
| `property_image` | JPEG, PNG, WebP | 5 MB |
| `property_video` | MP4, WebM | 50 MB |
| `floor_plan` | PDF, JPEG, PNG, WebP | 10 MB |
| `tenancy_evidence` | PDF, JPEG, PNG, WebP, plain text | 15 MB |

Listing media needs a `propertyId`, so the listing must be saved as a draft first.

To open a private file, call `GET /uploads/:fileId/access-url` when the user clicks.
These links are short-lived, so don't store them.

### Response handling

Response shapes vary between endpoints. For example, some return `data`, some
return `inquiry` or `user`, and some errors have only `message`. Put a small adapter
in the API layer and check each controller when connecting a page.

Every data page needs loading, empty and error states. Validation errors can include
`errors: [{ path, message }]`, which should appear next to the matching fields.

### Required wording

The backend is deliberately careful about what its results mean, and the UI must not
claim more. Show these messages where the data appears:

| Where | Message must make clear that |
|---|---|
| True cost | Figures are estimates from landlord data, not a quote. Show "unknown" when a total is `null`; never show 0 |
| Trust signals and warnings | They prompt human review. They don't prove fraud or verify ownership. The trust endpoint supplies `disclaimer` and `depositSafety` text to display |
| Match scores | They compare preferences. They aren't AI and don't guarantee a property is suitable |
| Neighborhood | Distances are straight-line, and the data comes from OpenStreetMap and may be incomplete. Credit the provider. Don't describe this as safety or quality |
| Evidence graph flags | They don't verify facts or decide liability |
| Condition comparison | It shows recorded differences. It doesn't say when damage happened or who is responsible |
| Clauses and payments | They are entered by users. They aren't legal advice or verified payments |

### Shared components

Layouts per role, property card, filter panel, map, upload widget, status badge,
paginated table, confirm dialog, cost breakdown, user picker (`GET /users/lookup`),
notification bell, and disclaimer box.

---

## 4. Public pages

### Home

**Route:** `/`

- Search bar with city, area and keywords, linking to Search results
- Recent listings
- Short explanation of true cost, trust signals and matching
- Sign-up call to action

**API:** `GET /properties/recent`

### Search results

**Route:** `/properties`

- **Filters:** `q`, `city`, `area`, `propertyType`, `furnishing`, `minRent`, `maxRent`,
  `bedrooms` (minimum), `maxBedrooms`, `availableBy`, `minLeaseDurationMonths`,
  `maxLeaseDurationMonths`, `amenities`
- **Sort:** `rent_asc`, `rent_desc`, `newest`, `oldest`
- List and map views, built in the frontend. Keep filters in the URL so results can
  be shared
- Pagination: maximum 50 per page
- Save and compare buttons on each card. "Save this search" for renters

**API:**
- `GET /properties/search`
- `GET /properties/nearby` for the map. It needs `latitude` and `longitude`, takes a
  `radius` of 100–5000 m, and orders by distance

**Rules:** Enums are `apartment`, `house`, `room`, `shared_accommodation` and
`furnished`, `semi_furnished`, `unfurnished`. Minimum values can't exceed maximums.

### Property detail

**Route:** `/properties/:id`

- **Gallery:** images, videos and floor plans
- **Facts:** description, type, bedrooms, bathrooms, floor, area, furnishing, amenities,
  house rules, availability, lease duration
- **True cost:** monthly and move-in totals, itemized charges, required/optional labels,
  landlord-provided/estimated labels, and missing components
- **Trust:** approved claims and warnings, plus the deposit safety notice
- **Neighborhood:** map, category counts and nearest places. Categories are `healthcare`,
  `education`, `groceries`, `transport`, `banking`, `recreation`, `food`
- **Landlord:** public name, photo and role only
- **Reviews:** list. Renters can write, edit, delete and report once they have a `confirmed` or `completed` viewing
- **Actions:**
  - Send inquiry: renter, up to 2000 characters
  - Request viewing: renter, a date and an optional message
  - Save, and add to compare
  - Report listing: renter, landlord or manager. Reasons are `duplicate_listing`,
    `inaccurate_details`, `suspicious_payment`, `misleading_photos`,
    `unavailable_property`, `other`

**API:**
- `GET /properties/:id/detail`
- `GET /property-trust/:propertyId`
- `GET /properties/:id/neighborhood-insights`
- `GET /nearby-places/:propertyId?radius=&category=`
- `GET /reviews/properties/:propertyId`
- `POST /reviews/properties/:propertyId`, `PATCH /reviews/:reviewId`, `DELETE /reviews/:reviewId`
- `POST /review-moderation/:reviewId/reports`
- `POST /inquiries`, with `{ propertyId, message }`
- `POST /viewings`, with `{ propertyId, requestedDate, message }`
- `POST /property-reports`, with `{ propertyId, reason, details }`
- `POST /saved-properties/:propertyId`, `DELETE /saved-properties/:propertyId`
- Renter view tracking: `POST /properties/:id/view-event`, `POST /users/me/recently-viewed/:propertyId`

**Rules:** Load neighborhood and reviews only when the user scrolls to them, to save
requests. Only published listings are visible.

### Compare properties

**Route:** `/compare`

- Side-by-side table of 2 to 4 listings: price, costs, facts, amenities and nearby-place
  counts
- Store the selection on the client, so it works before sign-in

**API:** `POST /properties/compare`, with `{ propertyIds: [...] }`

---

## 5. Sign-in pages

### Sign in

**Route:** `/sign-in`

Email and password through Firebase, then redirect by role.

**API:** Firebase client SDK, then `GET /users/me`

### Sign up

**Route:** `/sign-up`

Create a Firebase account. Add a renter/landlord choice once problem 1 is fixed.

**API:** Firebase client SDK

### Forgot password

**Route:** `/forgot-password`

Request a reset email.

**API:** Firebase client SDK

### Complete profile

**Route:** `/complete-profile`

Display name, required, up to 100 characters. Shown once, after first sign-up. All other
pages return `403` with "Create your Neve profile first" until this is done.

**API:** `POST /users/profile`, with `{ displayName }`

---

## 6. Renter pages

### Recommendations

**Route:** `/recommendations`

- Ranked listings with match score, reasons, shortfalls and unknowns
- Per-criterion breakdown
- Separate "outside your budget" section
- If `hasPreferences` is false, prompt the renter to set preferences

**API:** `GET /recommendations?page=&limit=`

**Rules:** Up to the newest 500 published listings are ranked. Commute and walking
distance preferences don't exist in the backend, so don't show them.

### Rental preferences

**Route:** `/preferences`

Fields: `cities`, `areas`, `minRent`, `maxRent`, `bedrooms`, `propertyTypes`, `furnishing`,
`amenities`, and `alertsEnabled`. Explain that alerts are sent in-app when a new listing
scores at least 70% and isn't over budget. There is no email or push.

**API:** `GET /renter-preferences`, `PUT /renter-preferences`

### Saved properties

**Route:** `/saved`

Paginated saved listings, with remove and compare.

**API:** `GET /saved-properties?page=&limit=`, `DELETE /saved-properties/:propertyId`

### Recently viewed

**Route:** `/recently-viewed`

Viewing history, with remove-one and clear-all.

**API:** `GET /users/me/recently-viewed`, `DELETE /users/me/recently-viewed/:propertyId`,
`DELETE /users/me/recently-viewed`

### Saved searches

**Route:** `/saved-searches`

- List with name, criteria summary and alert toggle
- Create and edit form, with a name up to 80 characters and the same fields as search
- "Run search" link to Search results
- Maximum of 20 searches

**API:** `GET`, `POST /saved-searches`; `GET`, `PATCH`, `DELETE /saved-searches/:searchId`

**Rules:** Explain that alerts only cover listings published after the search is saved.
A listing must match every selected criterion.

### My inquiries

**Route:** `/inquiries`

Inquiries the renter has sent, with property, status and landlord response. Each links
to its Message thread.

**API:** `GET /inquiries/mine`

### My viewings

**Route:** `/viewings`

List with date, property, status and landlord note. Filter by status. Requests can be
cancelled while still `requested`.

**API:** `GET /viewings/my-requests?status=&page=&limit=`, `PATCH /viewings/:viewingId/cancel`

**Statuses:** `requested`, `confirmed`, `declined`, `cancelled`, `completed` (see problem 8)

---

## 7. Shared signed-in pages

### Message thread

**Route:** `/inquiries/:inquiryId`

**Access:** The renter and landlord on that inquiry only (see problem 6)

- The original inquiry appears first, from `initialMessage`
- Paginated messages with read state
- Send box. Disabled when the inquiry is `declined` or `closed`
- Report a received message. Reasons are `scam_or_fraud`, `off_platform_payment`,
  `harassment`, `spam`, `threatening_or_abusive`, `other`, with optional details
- Warn users about paying outside the platform
- Link to create an agreement

**API:**
- `GET /inquiries/:inquiryId/messages`
- `POST /inquiries/:inquiryId/messages`, with `{ message }`
- `POST /inquiries/:inquiryId/messages/:messageId/report`, with `{ reason, details }`

**Rules:** Users can't report their own messages or report one twice. Contact details
aren't exposed, only public names and photos. There is no live update, so reload or poll
gently.

### Notifications

**Route:** `/notifications`

**Access:** All roles

- List with unread filter, mark one read and mark all read
- Each item links using `relatedProperty`, `relatedViewingRequest`, `relatedInquiry` or `relatedCase`
- Unread count in the header bell

**API:** `GET /notifications?isRead=&page=&limit=`, `GET /notifications/unread-count`,
`PATCH /notifications/:id/read`, `PATCH /notifications/read-all`

**Types:** `viewing_request_received`, `viewing_request_confirmed`, `viewing_request_declined`,
`viewing_request_approved`, `viewing_request_rejected`, `inquiry_message_received`,
`matching_listing_available`, `tenancy_case_shared`

### Account

**Route:** `/account`

**Access:** All roles

Shows name, email, photo, phone and role. Read-only until problem 5 is fixed. Password
changes go through Firebase.

**API:** `GET /users/me`

### Privacy and data

**Route:** `/account/privacy`

**Access:** All roles

- Download my data as JSON. File contents aren't included
- Request deletion of a private document, with a required reason up to 1000 characters
- Status of deletion requests: `pending`, `processing`, `approved`, `rejected`,
  `completed`, `failed`
- Explain that deletion needs admin approval, and a file stays if it is still in use, under
  legal hold, or within its retention period

**API:** `GET /privacy/export`, `GET /privacy/documents/deletion-requests`,
`POST /privacy/documents/:fileId/deletion-requests`

### My reports

**Route:** `/reports`

**Access:** Renter, landlord, property manager

Listing reports the user submitted, with reason, status and date. Statuses are
`pending`, `in_review`, `resolved`, `dismissed`.

**API:** `GET /property-reports/my-reports?page=&limit=`

---

## 8. Landlord and property manager pages

Managers see listings they own or are currently assigned to.

### Dashboard

**Route:** `/dashboard`

- Listing counts by status
- Views, unique visitors and inquiries, overall and per listing, with a date range
- Links to pending inquiries and viewings

**API:** `GET /landlord/dashboard/properties?status=&page=&limit=`,
`GET /landlord/dashboard/performance?from=&to=`

### My listings

**Route:** `/listings`

Table with status, rent and date. Actions are edit, publish and pause. Filter by `draft`,
`published`, `paused`.

**API:** `GET /landlord/dashboard/properties?status=&page=&limit=`, which includes counts by
status, and `PATCH /properties/:id/status`, with `{ status }`

**Rules:** Status can only be set to `published` or `paused`, so a listing can't go back
to draft. The publish response includes `matchingAlerts`. Show a message if its status is
`failed`.

### Create/edit listing

**Routes:** `/listings/new`, `/listings/:id/edit`

A step-by-step form is recommended, because media requires a saved draft.

1. **Basics:** `title` (up to 150), `description` (up to 5000), `propertyType`, `bedrooms`,
   `bathrooms` (minimum 1), `areaSqft`, `floor`, `furnishing`
2. **Location:** `address.area`, `address.city`, map pin
3. **Terms:** `pricing.monthlyRent` (required), `securityDeposit`, `advanceRent`,
   `oneTimeFees`, `monthlyServiceCharge`, `estimatedMonthlyUtilities`, `availabilityDate`,
   `leaseDurationMonths` (1–120), `amenities` (up to 50), `houseRules`
4. **Media:** up to 20 images, 5 videos and 5 floor plans
5. **Cost disclosure:** itemized charges and unknown costs
6. **Review:** consistency warnings, then publish
7. **Managers:** landlord only, assign or revoke, up to 10 active

**API:**
- `POST /properties`, `PATCH /properties/:id`
- Upload steps, then `POST /property-images/:propertyId/:fileId/attach`, `DELETE /property-images/:propertyId/:fileId`
- `PUT /rental-costs/:propertyId`, with `{ items, unknownCosts }`
- `GET /listing-consistency/:propertyId`
- `GET /properties/:id/managers`, `PATCH /properties/:id/managers`, with `{ managerId, action }`
- `GET /users/lookup?type=manager&q=` to find a manager

**Rules:**
- The map pin must be sent as `address.location: { type: "Point", coordinates: [longitude, latitude] }`.
  **Longitude comes first**, and the top-level `location` field isn't editable.
- Cost item types are `monthly`, `monthly_estimate`, `one_time`, `refundable_deposit`. Limits
  are 50 items and 20 unknown notes.
- Warn landlords not to enter the same fee in both pricing fields and itemized charges.
- An empty item list and empty `unknownCosts` means "no additional charges". Missing
  disclosure makes totals `null`.
- Although the README says managers can view manager assignments, the route allows only
  landlords.

### Listing claims

**Route:** `/listings/:id/claims`

**Access:** Landlord only

Add statements about a listing and back them with files, for admin review.

- Claim form: `claimType` (`rent`, `bedrooms`, `bathrooms`, `amenity`, `ownership`,
  `availability`, `other`), `statement`, `claimedValue`, `source` (`listing`, `landlord`,
  `document`, `other`)
- Attach evidence with a relationship and explanation
- Status per claim: `unreviewed`, `supported`, `contradicted`, `inconclusive`

**API:**
- `GET /evidence-graph/properties/:propertyId`
- `POST /evidence-graph/properties/:propertyId/claims`
- `POST /evidence-graph/properties/:propertyId/claims/:claimId/evidence`
- `PATCH /evidence-graph/properties/:propertyId/evidence/:linkId`

### Received inquiries

**Route:** `/listings/inquiries`

List with renter name, property, message and status. Filter by status. Accept or decline
with a response, then close later. Landlords can open the Message thread.

**API:** `GET /inquiries/landlord?status=&page=&limit=`,
`PATCH /inquiries/:inquiryId/respond`, with `{ status, responseMessage }`,
`PATCH /inquiries/:id`, with `{ status: "closed" }`

### Received viewings

**Route:** `/listings/viewings`

List or calendar of requests. Confirm or decline with a note. Only `requested` viewings
can be answered.

**API:** `GET /viewings/landlord?status=&page=&limit=`,
`PATCH /viewings/:viewingId/respond`, with `{ status, landlordResponse }`

### Assigned tenancies

**Route:** `/tenancies`

**Access:** Property manager only

Assigned agreements with lease dates, open obligations and a maintenance summary. Links to
Agreement detail.

**API:** `GET /landlord/dashboard/tenancies?page=&limit=`

**Rules:** Listing assignment and agreement assignment are separate. A manager of a listing
doesn't automatically get its agreements.

---

## 9. Tenancy and dispute pages

| Action | Renter, landlord | Assigned manager | Shared reviewer |
|---|---|---|---|
| View shared records | Yes | Yes | Yes |
| Create an agreement, clause or payment | Yes | No | No |
| Update obligations | Yes | Yes | No |
| Condition reports and maintenance | Yes | Yes | No |
| Create or share a dispute case | Yes | No | No |

All pages must hide edit controls for read-only users. The API also refuses those changes.

### Agreements

**Route:** `/agreements`

List with title, property, other party, status and dates. Statuses are `draft`, `shared`,
`under_review`, `disputed`, `archived`. Page size can go up to 100.

Legal reviewers also get a **Shared cases** tab, because a case can be shared
without its agreement. Filter it by status.

**API:** `GET /tenancy/agreements?page=&limit=`, `GET /tenancy/cases?status=&page=&limit=`

### New agreement

**Route:** `/agreements/new`

**Access:** Renter, landlord

1. Choose the related inquiry, which sets the property
2. Upload the document as `tenancy_evidence`
3. Enter `title` (up to 150), and optionally `startAt`, `endAt`, `monthlyRentBdt`, `depositBdt`,
   `advanceRentBdt`

**API:** Upload steps, then `POST /tenancy/agreements`, with
`{ propertyId, inquiryId, fileId, title, ... }`

**Rules:** An agreement must link to an inquiry involving the user, so link here from the
Message thread. The end date can't be before the start date. Bangladesh is the only
jurisdiction, and amounts are in BDT.

### Agreement detail

**Route:** `/agreements/:agreementId`

Open the document, and use tabs for:

| Tab | Contents | API |
|---|---|---|
| Overview | Parties, dates, amounts, status | `GET /tenancy/agreements/:agreementId`, `PATCH .../status` |
| Clauses | `heading`, `category`, `text`, `plainLanguageNote`, `sourcePage` | `POST .../clauses` |
| Obligations | `description`, `responsibleParty`, `dueAt`, `amountBdt`, `notes`, `evidenceFileId`. Status is `open`, `completed`, `disputed` | `POST .../obligations`, `PATCH .../obligations/:obligationId` |
| Payments | `paymentType`, `amountBdt`, `paidAt`, `reference`, `receiptFileId`. Status is `recorded`, `disputed` | `POST .../payments`, `PATCH .../payments/:paymentId` |
| Disputes | Case list and new case: `title`, `summary` | `GET`, `POST .../cases` |
| Sharing | Grant or revoke reviewer access. Explain that this shares the whole agreement | `GET /users/lookup?type=reviewer&q=`, `POST .../shares`, `DELETE .../shares/:userId` |
| Manager | Assign or remove, with `{ managerId }` or `null` | `GET /users/lookup?type=manager&q=`, `PATCH .../property-manager` |
| Activity | Audit trail, last 100 events | Included in the agreement |

The tabs also link to Evidence graph, Condition reports, Condition comparison and
Maintenance.

**Rules:** Clause notes are written by users, so never label them as AI or legal guidance.
OCR, extraction and generated explanations don't exist. Links already issued keep working
for up to five minutes after access is revoked.

### Evidence graph

**Route:** `/agreements/:agreementId/evidence`

- Graph of agreement, clause, obligation, payment, message, event and evidence nodes.
  A table view is needed too, for accessibility and small screens
- Flags for missing information, disputes and low-confidence links
- Add a link: `targetType` (`agreement`, `clause`, `obligation`, `payment`, `message`),
  `targetId`, `fileId`, `relationship`, `explanation` (up to 1000), `confidence` (0–1)
- Relationships are `supports`, `contradicts`, `relates_to`, `cites`, `context_only`, `unassessed`
- History of changes per link
- Download the JSON report

**API:** `GET /tenancy/agreements/:agreementId/evidence-graph`,
`POST .../evidence-links`, `PATCH .../evidence-links/:linkId`, `GET .../evidence-report`

**Rules:** The report caps messages at 500 and marks truncation, which should be shown. File
contents aren't embedded. Generating a report is logged.

### Condition reports

**Route:** `/agreements/:agreementId/condition`

- Move-in and move-out tabs, with one report per stage
- **Room entry:** `room`, `item`, `condition` (`excellent`, `good`, `fair`, `poor`, `damaged`,
  `not_working`), `notes`, up to 10 photos
- **Meter entry:** `meterType` (`electricity`, `gas`, `water`), `reading`, `unit`
- Confirm or dispute an entry, with a note
- Corrections add a new entry and keep the old one visible

**API:**
- `GET /tenancy/agreements/:agreementId/condition-reports`
- `POST .../condition-reports/:stage`, where stage is `move_in` or `move_out`
- `POST .../condition-reports/:reportId/entries`, with `{ kind, ..., photoFileIds }`
- `POST .../entries/:entryId/reviews`, with `{ decision, note }`
- `POST .../entries/:entryId/corrections`

**Rules:** Entries can't be edited or deleted, so make the correction flow obvious. Mobile
use is likely, since people will take photos during an inspection.

### Condition comparison

**Route:** `/agreements/:agreementId/condition/compare`

Move-in and move-out side by side, by room and item or by meter, using the latest entry of
each. Highlight differences, and include the required wording that fault isn't assigned.

**API:** `GET /tenancy/agreements/:agreementId/condition-comparison`

### Maintenance

**Route:** `/maintenance`

No endpoint returns a single request, so details open in a panel on this page.

- Search and filter by text (`q`, up to 120 characters) and status, across all the user's
  agreements
- **New request:** `title` (up to 150), `description` (up to 4000), `category` (`plumbing`,
  `electrical`, `appliance`, `structure`, `pest`, `heating_cooling`, `other`), `priority`
  (`low`, `normal`, `high`, `urgent`), `responsibility`, up to 10 evidence files
- **Panel:** progress timeline, with a form for message, status, responsibility and evidence

**API:** `GET /tenancy/maintenance-requests?q=&status=&page=&limit=`,
`POST /tenancy/agreements/:agreementId/maintenance-requests`,
`PATCH /tenancy/maintenance-requests/:requestId/progress`

**Status options:** only offer these next steps:

| From | To |
|---|---|
| `submitted` | `acknowledged`, `in_progress`, `disputed`, `cancelled` |
| `acknowledged` | `in_progress`, `awaiting_renter`, `completed`, `disputed`, `cancelled` |
| `in_progress` | `awaiting_renter`, `completed`, `disputed`, `cancelled` |
| `awaiting_renter` | `in_progress`, `completed`, `disputed`, `cancelled` |
| `completed` | `in_progress`, `disputed` |
| `disputed` | `in_progress`, `completed`, `cancelled` |
| `cancelled` | None |

Only the requester or assigned manager can cancel. There's no contractor assignment feature,
so don't design one.

### Dispute case detail

**Route:** `/cases/:caseId`

- Title, summary and status: `open`, `resolved`, `closed`
- Selected evidence, with add and remove. Removal history is kept
- Share or revoke access for a legal reviewer
- Reviewers get a read-only view of this case and its selected files

**API:** `GET /tenancy/cases/:caseId`, `POST /tenancy/cases/:caseId/evidence`, with `{ fileId }`,
`DELETE /tenancy/cases/:caseId/evidence/:fileId`, `PATCH /tenancy/cases/:caseId/status`,
`GET /users/lookup?type=reviewer&q=`, `POST /tenancy/cases/:caseId/shares`, with `{ userId }`, `DELETE /tenancy/cases/:caseId/shares/:userId`

**Rules:** Only files already linked to the agreement can be added. Case-only reviewers must
not see links to the agreement, because they can't open it. They find shared cases through
`GET /tenancy/cases` or the `tenancy_case_shared` notification, which links through `relatedCase`.

---

## 10. Admin pages

All pages are under `/admin` and need the `admin` role. Most lists support `page`, `limit`
and `status`.

### Overview

**Route:** `/admin`

Counts for total and published properties, pending reports, open warnings, unreviewed claims
and pending communication reports. Each count links to its queue.

**API:** `GET /admin/dashboard/overview`

### Listing reports

**Route:** `/admin/reports`

Review queue with reason, details, reporter and listing. Set status to `pending`, `in_review`,
`resolved`, `dismissed`. Includes a duplicate check that shows similarity signals, described
as a review aid and not as a fraud probability.

**API:** `GET /admin/dashboard/reports`, `PATCH /property-reports/admin/:reportId`, with `{ status, reviewNote }`,
`GET /duplicate-listings/:propertyId/duplicate-check`

### Listing warnings

**Route:** `/admin/warnings`

Warning type, severity (`low`, `medium`, `high`), message and evidence. Set status to `open`,
`reviewed`, `dismissed`, `resolved`. Write and publish a public summary of up to 500 characters
once the warning is `reviewed` or `resolved`.

**API:** `GET /admin/dashboard/warnings`, `PATCH /admin/moderation/warnings/:warningId/status`,
`PATCH /admin/trust-approval/warnings/:warningId/public-summary`, with
`{ publiclyVisible, publicSummary }`

### Property claims

**Route:** `/admin/claims`

Claim, evidence and review note. Set status to `supported`, `contradicted`, `inconclusive`,
`unreviewed`. A public summary needs one of the first three.

**API:** `GET /admin/dashboard/claims`, `GET /evidence-graph/properties/:propertyId`,
`PATCH /admin/moderation/claims/:claimId/review`, with `{ status, reviewNote }`,
`PATCH /admin/trust-approval/claims/:claimId/public-summary`

### Communication reports

**Route:** `/admin/communication-reports`

Reported messages with reason, details, reporter and reported user. Set status and a review
note. Reports don't restrict accounts automatically, and no account-suspension endpoint exists.

**API:** `GET /admin/dashboard/communication-reports`,
`PATCH /admin/moderation/communication-reports/:reportId/status`, with `{ status, reviewNote }`

### Review moderation

**Route:** `/admin/reviews`

Reported reviews with reason (`spam`, `abusive`, `fake`, `irrelevant`, `personal_information`,
`other`). Hide or restore the review, and mark the report `reviewed` or `dismissed`.

**API:** `GET /review-moderation/reports?status=`, `PATCH /review-moderation/reports/:reportId`,
`PATCH /review-moderation/:reviewId/moderation`, with `{ action, reason }`

### Audit logs

**Route:** `/admin/audit-logs`

Read-only table. Filter by `action`, `targetType` (`property_report`, `listing_warning`,
`property_claim`, `communication_report`, `ai_evaluation`) and `actorId`.

**API:** `GET /admin/audit-logs`

### Deletion requests

**Route:** `/admin/privacy/deletion-requests`

Requests with reason and status, defaulting to `pending`. Approve or reject with a note of up
to 1000 characters. Warn that approval deletes the file permanently.

**API:** `GET /admin/privacy/deletion-requests?status=`,
`PATCH /admin/privacy/deletion-requests/:requestId`, with `{ status, reviewNote }`

**Rules:** Deletion only goes ahead when the file is unreferenced, its retention date has
passed and it has no legal hold. Show the reason if it fails.

### Retention and legal holds

**Route:** `/admin/privacy/retention`

Records past their retention date. Set `retentionUntil` and `legalHold`. Nothing is purged
automatically, and the backend doesn't define a retention period, so NEVE needs its own policy.

**API:** `GET /admin/privacy/retention-due`, `PATCH /admin/privacy/files/:fileId/retention`

### Sensitive access logs

**Route:** `/admin/privacy/access-logs`

Read-only log of who accessed agreements, cases and files. Filter by `agreementId`. Admins can
see this log, but can't open private files because of it.

**API:** `GET /admin/privacy/access-logs?agreementId=&page=&limit=`

### AI evaluation runs

**Route:** `/admin/ai-evaluations`

List of runs, filtered by `task` (`ocr`, `agreement_extraction`, `evidence_link_accuracy`,
`missing_information`, `legal_citation`, `suspicious_listing`). Submit a run with model and
dataset versions and a JSON list of cases.

**API:** `GET /admin/ai-evaluations/runs`, `POST /admin/ai-evaluations/runs`

**Rules:** This page records results produced elsewhere. The backend doesn't run any AI, so the
UI must not suggest it does. Warn admins to use only consented benchmark data.

### AI evaluation run detail

**Route:** `/admin/ai-evaluations/:runId`

- Precision, recall, F1 and exact-match rate for reasoning tasks
- Character error rate for OCR
- False-positive rate for `suspicious_listing`
- Failure rate, mean and p95 latency, and cost

Only show metrics that apply to the run's task.

**API:** `GET /admin/ai-evaluations/runs/:runId`

### Proposed: User management

**Route:** `/admin/users`

Search users, change roles, and activate or deactivate accounts.

**API:** Doesn't exist yet. Needed for problem 1. `User.isActive` is already enforced by the
backend, but nothing can change it.

---

## 11. System pages

### 404 Not Found

**Route:** any unknown URL. Also used when the API returns `404` for a record the user can't
access, since the backend returns `404` rather than confirming that a private record exists.

### 403 Access Denied

Shown when the user's role can't open a page. Handle two special cases: "Create your Neve
profile first" goes to Complete profile, and "Your account is inactive" shows an inactive
account message.

---

## 12. Build order

| Phase | Build | Why now |
|---|---|---|
| 0 | Backend problem 1, app shell, API layer, Firebase, upload widget | Everything else depends on these |
| 1 | Sign-in pages, System pages, Account | Users must be able to get in |
| 2 | My listings, Create/edit listing, Dashboard | Creates real data for other pages |
| 3 | Home, Search results, Property detail, Compare | The core product |
| 4 | Saved properties, Recently viewed, Saved searches, Preferences, Recommendations | Personalization |
| 5 | My inquiries, Received inquiries, Message thread, My viewings, Received viewings, Notifications, My reports | Connects renters and landlords. Agree the inquiry flow first (problem 7) |
| 6 | Agreements, New agreement, Agreement detail, Maintenance | Tenancy starts here |
| 7 | Condition reports, Condition comparison, Evidence graph, Dispute case detail, Assigned tenancies | Depends on agreements |
| 8 | Admin Overview, Reports, Warnings, Claims, Listing claims, Communication reports, Review moderation | Trust and moderation |
| 9 | Audit logs, Privacy and data, Deletion requests, Retention, Access logs, AI evaluations, User management | Compliance and internal tools |

---

## 13. Features with no page yet

The backend README lists these as absent or partial, so no page is specified for them. Don't
design them without backend work:

- Identity and property-ownership verification
- Walking or driving routes and travel times
- Commute-based matching
- Email and push notifications
- OCR, clause extraction, AI-generated explanations and legal-source retrieval
- Live AI evaluation
- Repair contractor assignment
- Automatic retention purges and hash-based tamper evidence
