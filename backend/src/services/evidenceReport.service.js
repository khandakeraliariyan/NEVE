import { analyzeAgreementEvidence } from "./evidenceGraphAnalysis.service.js";

const idOf = (value) => (value == null ? null : String(value._id ?? value));

export function buildAgreementEvidenceReport({
    agreement,
    links,
    files,
    messages,
    recordLinks = [],
    conditionReports = [],
    generatedAt = new Date(),
    messageCount = messages.length,
    messageLimit = 500,
}) {
    const fileById = new Map(files.map((file) => [String(file._id), file]));
    const messageTruncated = messageCount > messages.length;

    return {
        format: "neve.tenancy-evidence-report",
        version: 1,
        generatedAt,
        scope: {
            agreementId: idOf(agreement._id),
            title: agreement.title,
            status: agreement.status,
            jurisdiction: agreement.jurisdiction,
        },
        agreement: {
            startAt: agreement.startAt,
            endAt: agreement.endAt,
            monthlyRentBdt: agreement.monthlyRentBdt,
            depositBdt: agreement.depositBdt,
            advanceRentBdt: agreement.advanceRentBdt,
        },
        // Values the extraction service proposed from the agreement file.
        // They are not participant-recorded values.
        extraction:
            agreement.extraction?.status === "completed"
                ? {
                      model: agreement.extraction.model,
                      extractedAt: agreement.extraction.extractedAt,
                      documentLanguage: agreement.extraction.documentLanguage,
                      parties: agreement.extraction.parties,
                      facts: agreement.extraction.facts,
                      proposedObligations:
                          agreement.extraction.proposedObligations,
                      limitations: agreement.extraction.limitations,
                  }
                : null,
        sources: {
            files: files.map((file) => ({
                id: idOf(file._id),
                name: file.originalName,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
                status: file.status,
            })),
            clauses: agreement.clauses.map((clause) => ({
                id: idOf(clause._id),
                heading: clause.heading,
                category: clause.category,
                text: clause.text,
                plainLanguageNote: clause.plainLanguageNote,
                sourcePage: clause.sourcePage,
                origin: clause.origin ?? "user",
                reviewStatus: clause.reviewStatus ?? "confirmed",
                sourceText: clause.sourceText ?? "",
                sourceVerified: clause.sourceVerified ?? null,
                ambiguityNote: clause.ambiguityNote ?? "",
                createdAt: clause.createdAt,
                updatedAt: clause.updatedAt,
            })),
            obligations: agreement.obligations.map((obligation) => ({
                id: idOf(obligation._id),
                description: obligation.description,
                responsibleParty: obligation.responsibleParty,
                dueAt: obligation.dueAt,
                amountBdt: obligation.amountBdt,
                status: obligation.status,
                evidenceFileId: idOf(obligation.evidenceFile),
            })),
            payments: agreement.payments.map((payment) => ({
                id: idOf(payment._id),
                paymentType: payment.paymentType,
                amountBdt: payment.amountBdt,
                paidAt: payment.paidAt,
                payer: payment.payer,
                status: payment.status,
                reference: payment.reference,
                receiptFileId: idOf(payment.receiptFile),
            })),
            messages: {
                included: messages.map((message) => ({
                    id: idOf(message._id),
                    body: message.body,
                    sender: message.sender
                        ? {
                              id: idOf(message.sender._id),
                              displayName: message.sender.displayName,
                              role: message.sender.role,
                          }
                        : null,
                    createdAt: message.createdAt,
                })),
                total: messageCount,
                includedCount: messages.length,
                truncated: messageTruncated,
                limit: messageLimit,
            },
            relationships: links.map((link) => {
                const fileId = idOf(
                    link.uploadedFile?._id ?? link.uploadedFile
                );
                const file = fileById.get(fileId);
                return {
                    id: idOf(link._id),
                    targetType: link.targetType,
                    targetId: idOf(link.targetId),
                    fileId,
                    file: file
                        ? {
                              name: file.originalName,
                              mimeType: file.mimeType,
                          }
                        : null,
                    relationship: link.relationship,
                    explanation: link.explanation,
                    confidence: link.confidence ?? null,
                    confirmedBy: (link.confirmations ?? []).map((entry) => ({
                        userId: idOf(entry.user),
                        confirmedAt: entry.confirmedAt,
                    })),
                    linkedBy: link.linkedBy
                        ? {
                              id: idOf(link.linkedBy._id ?? link.linkedBy),
                              displayName: link.linkedBy.displayName,
                              role: link.linkedBy.role,
                          }
                        : null,
                    createdAt: link.createdAt,
                    updatedAt: link.updatedAt,
                    history: link.history.map((event) => ({
                        actorId: idOf(event.actor),
                        relationship: event.relationship,
                        explanation: event.explanation,
                        confidence: event.confidence ?? null,
                        createdAt: event.createdAt,
                    })),
                };
            }),
            recordRelationships: recordLinks.map((link) => ({
                id: idOf(link._id),
                fromType: link.fromType,
                fromId: idOf(link.fromId),
                toType: link.toType,
                toId: idOf(link.toId),
                relationship: link.relationship,
                explanation: link.explanation,
                createdBy: idOf(link.createdBy),
                createdAt: link.createdAt,
            })),
            auditHistory: agreement.auditTrail.map((event) => ({
                actorId: idOf(event.actor),
                action: event.action,
                targetType: event.targetType,
                targetId: idOf(event.targetId),
                createdAt: event.createdAt,
            })),
        },
        analysis: analyzeAgreementEvidence(agreement, links, recordLinks, conditionReports),
        disclaimer:
            "This report compiles user-entered records and participant assessments. It does not independently verify evidence, provide legal advice, or determine liability. File contents are not embedded; sources are identified by their record IDs and metadata.",
    };
}
