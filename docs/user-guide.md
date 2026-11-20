# User guide

How to use NEVE, by role. Menu names match the app's sidebar. For what each feature does in detail see [features.md](features.md).

NEVE gives information, not legal advice. It shows what is documented, disputed, uncertain or missing, and never decides who is right. Check AI output against the source documents, and talk to a lawyer before acting on anything important.

## Contents

- [Getting started](#getting-started)
- [Renters](#renters)
- [Landlords](#landlords)
- [Working on a tenancy (renters and landlords)](#working-on-a-tenancy-renters-and-landlords)
- [Legal reviewers](#legal-reviewers)
- [Administrators](#administrators)
- [Your account and privacy](#your-account-and-privacy)

## Getting started

1. **Sign up** at `/sign-up` with email or Google, then **complete your profile** and choose renter or landlord. Legal reviewer and admin accounts are created by an admin.
2. Your **workspace** opens. The sidebar shows the menus for your role. For renters and landlords, **Legal intelligence** comes right after the dashboard:
   - **Risk Sentinel**: what needs attention across your agreements;
   - **Legal Copilot**: ask about rental law, with citations;
   - **Legal library**: read the approved legal sources.
3. Optionally, **verify** your identity under **Verification**. Landlords can also verify property ownership.

## Renters

### Before you sign

1. **Find a home.** Use **Find Homes** to search by city, area, type and maximum rent. Each listing shows:
   - **True cost**: monthly and move-in totals from the landlord's itemized charges. Missing costs show as unknown, never as zero.
   - **Neighborhood**: nearby places and travel times.
   - **Trust signals**: reviewed summaries of reports and checks. They prompt a closer look and don't prove fraud.
2. **Compare** up to four homes, **save** favorites and searches, and set your preferences for **Smart recommendations**. Each match shows its score, the reasons, the shortfalls and what's unknown.
3. **Contact the landlord** with an inquiry, and **request a viewing**.
4. **Ask Legal Copilot** about anything in the offer, for example *"How much advance can a landlord take?"*. Open each citation to read the official text.

### Starting a tenancy record

- If the landlord invites you, open **Invitations** and accept, signed in with the invited email address. Or create the record yourself under **Agreements & evidence**.
- Upload the agreement, then follow [Working on a tenancy](#working-on-a-tenancy-renters-and-landlords).

## Landlords

1. **List a property.** Go to **Create property** and add the details, an itemized cost for each charge, photos, videos and floor plans. Listings are checked for consistency and duplicates. If a **listing warning** appears, you can correct the listing or appeal.
2. **Handle interest.** Answer **Inquiries** and manage requests under **Viewing management**. The **Dashboard** shows each listing's performance.
3. **Start a tenancy record.** Under **Invite a renter**, invite the renter by email for one of your properties. When they accept, the agreement record is shared between you.
4. Then follow [Working on a tenancy](#working-on-a-tenancy-renters-and-landlords). **Risk Sentinel** shows what needs attention across all your tenancies.

## Working on a tenancy (renters and landlords)

Open **Agreements & evidence**, then the agreement. The agreement page has tabs (**Overview**, **Obligations**, **Payments**, **Sharing**, **Activity**) and buttons for each section (**Clauses**, **Risk check**, **Documents**, **Evidence graph**, **Condition reports**, **Maintenance**, **Dispute cases**). A typical order:

| Step | Where | What to do |
|---|---|---|
| 1. Record the agreement | **Overview**, **Documents** | Upload the signed agreement (PDF or photo) and enter the key terms: rent, deposit, advance, dates. Add amendments, receipts, notices and photos to the document vault. |
| 2. Extract the contents | **Clauses** | Run **extraction**. NEVE proposes clauses, terms and obligations from the document. Confirm or reject each one; nothing counts until a party confirms it. |
| 3. Check the agreement | **Risk check** | Run the risk check. Read each finding's quoted clause, **why it was flagged** and its **decision trace**. Mark findings acknowledged, resolved or dismissed. Download the PDF report if useful. |
| 4. Connect the law | **Clauses** | Ask for **legal suggestions** to link clauses to approved sections, and accept the ones that fit. Ask for a **rewrite suggestion** on a one-sided clause and discuss it with the other party. |
| 5. Keep records | **Obligations**, **Payments**, **Condition reports**, **Maintenance** | Track obligations and due dates, record payments with receipts, do the move-in condition report room by room with meter readings, and report repairs with photos. |
| 6. Watch for conflicts | **Evidence graph** | See how records connect and what is disputed, missing or contradictory. Link evidence to records, accept or reject AI-proposed links, and **review flags**: mark one *resolved* or *not an issue*, with a reason. |
| 7. See everything at once | **Risk Sentinel** (sidebar) | Open items across all agreements, high priority first, each with its reason and a link back. |
| 8. If there's a dispute | **Dispute cases** | Open a case, add evidence, list the issues, and write your **statement** (private until you share it). Share the case with a **legal reviewer** for notes and an opinion. Download the **evidence report**. |
| 9. Share and check integrity | **Sharing**, **Activity** | Share the agreement with someone, see its history, and run the **integrity check**, which confirms the audit trail is intact and stored files match their recorded hashes. |

**Tips**
- A flag is a prompt to check. Differences can be legitimate, for example a price agreed after the viewing. Say so in your review reason.
- Record payments promptly, ideally with a receipt. Both parties can record the same payment, and NEVE flags it if your records differ.
- Condition entries can't be edited; add a **correction** instead, so the history stays.

## Legal reviewers

Your sidebar has **Case queue**, **Risk Sentinel**, **Legal sources**, **AI oversight** and **AI evaluations**, plus **Legal Copilot** and **Legal library**.

### Reviewing legal sources

1. Open **Legal sources**. Sources waiting for you are **in review**.
2. Compare each section with the official publication. The provenance shows where and when the text was copied.
3. **Approve**, **request changes** or **reject**. You can't approve a source you drafted. Once approved, the source is used by Copilot, legal suggestions, risk findings and rewrites.
4. If you find a problem in an approved source later, **flag** it.

The corpus files and their provenance are described in [frontend/legal-corpus/README.md](../frontend/legal-corpus/README.md).

### Reviewing cases

1. **Case queue** lists the cases shared with you.
2. Read the agreement, records, statements and flags.
3. Post **notes**, **questions** and written **opinions**. The parties reply. Entries can't be edited later.
4. On agreements you can see, you can also:
   - give a verdict on risk findings (agree, disagree or needs context);
   - assess clause rewrites (endorsed or has concerns).

### AI oversight

- **AI oversight** lists Copilot answers that users reported. Review each one and record the outcome.
- **AI evaluations** shows stored evaluation runs and their scores (see [evaluation-methodology.md](evaluation-methodology.md)).

## Administrators

Admins sign in at `/admin/sign-in`. Admin accounts are created with `npm run create-admin` or by invitation from another admin (see the [root README](../README.md#admin-accounts)).

| Menu | Use it to |
|---|---|
| **Platform health** | See the overall state of the platform at a glance. |
| **Moderation** | Review property and message reports, listing warnings and appeals, landlord claims; approve public summaries; suspend a listing. |
| **Verification queue** | Review identity, ownership and reviewer-credential documents. |
| **Users** / **Account appeals** | Manage accounts and roles; decide appeals. |
| **Legal reviewers** | Invite and manage legal reviewers. |
| **Legal sources** | Draft and assign sources; see reviewer activity and outdated citations. Approval is left to legal reviewers. |
| **Audit trail** | Read the admin audit log and check its integrity. |
| **Security & incidents** | Authentication events; track incidents step by step. |
| **Data retention** | Handle document deletion requests and retention; read sensitive-access logs. |
| **System jobs & delivery** / **System errors** | Run background jobs now, retry failed emails, follow grouped server errors. |
| **Platform settings** | Announcement, sign-up switches, reminder timing, **who may use each feature** (for example Legal Copilot), the AI on/off switch, privacy policy, email templates. |
| **AI usage & cost** / **AI evaluations** | Watch AI calls, tokens, cost and errors; store and compare evaluation runs. |

## Your account and privacy

- **Settings** has your profile, photo, sessions (sign out other devices), login history, notification preferences, **data export** and **account deletion**.
- **Document deletion.** You can ask for a tenancy document to be deleted. An admin reviews the request, because the other party may rely on it.
- **What AI sees.** Before any AI call, personal identifiers are removed from the text: NID, passport and phone numbers, and email addresses. Your files are never sent to the AI model.
- **Notifications.** In-app and email, per type, with a daily digest option and one-click unsubscribe.
