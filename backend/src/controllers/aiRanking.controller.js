import RenterPreference from "../models/RenterPreference.js";
import {
    AI_RANKING_SHORTLIST_SIZE,
    AIRankingError,
    isAIRankingConfigured,
    rankingInputHash,
    requestAIRanking,
} from "../services/aiRanking.service.js";
import { getRecommendationShortlist } from "../services/propertyMatching.service.js";

const NOTE =
    "AI ranking is advice based only on the listing details and your preferences. It can be wrong; check the listing and ask the landlord before deciding. It does not change the rule-based match score.";

// Fields of each listing the ranking view shows.
const listingSummary = (property) => ({
    _id: property._id,
    title: property.title,
    address: { area: property.address?.area, city: property.address?.city },
    propertyType: property.propertyType,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    images: (property.images ?? []).slice(0, 1),
    pricing: { monthlyRent: property.pricing?.monthlyRent ?? null },
});

// Joins a saved ranking with the current shortlist, in the AI's order.
export function presentRanking(saved, shortlist) {
    const byId = new Map(shortlist.map((result) => [String(result.property._id), result]));
    return {
        rankedAt: saved.rankedAt,
        model: saved.model,
        overallNote: saved.overallNote ?? null,
        rankings: saved.rankings
            .filter((item) => byId.has(String(item.propertyId)))
            .map((item, index) => {
                const result = byId.get(String(item.propertyId));
                return {
                    rank: index + 1,
                    ...item,
                    ruleBasedScore: result.matchScore ?? null,
                    property: listingSummary(result.property),
                };
            }),
    };
}

// GET /api/v1/recommendations/ai-ranking
export async function getAIRanking(req, res, next) {
    try {
        const available = isAIRankingConfigured();
        const data = await getRecommendationShortlist(req.neveUser._id, AI_RANKING_SHORTLIST_SIZE);
        if (!data) {
            return res.json({ available, hasPreferences: false, ranking: null, stale: false, shortlistSize: 0, note: NOTE });
        }
        const { preferences, shortlist } = data;
        const saved = preferences.aiRanking;
        const current = Boolean(saved) && saved.inputHash === rankingInputHash(preferences, shortlist);
        return res.json({
            available,
            hasPreferences: true,
            shortlistSize: shortlist.length,
            ranking: current ? presentRanking(saved, shortlist) : null,
            // A saved ranking exists but preferences or listings changed since.
            stale: Boolean(saved) && !current,
            note: NOTE,
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/recommendations/ai-ranking  { refresh?: boolean }
// Ranks the renter's top matches with Claude. A ranking made from the same
// preferences and listings is reused unless refresh is true.
export async function runAIRanking(req, res, next) {
    try {
        if (!isAIRankingConfigured()) {
            return res.status(503).json({ success: false, message: "AI ranking is not available right now." });
        }
        const data = await getRecommendationShortlist(req.neveUser._id, AI_RANKING_SHORTLIST_SIZE);
        if (!data) {
            return res.status(409).json({ success: false, message: "Set your renter preferences first." });
        }
        const { preferences, shortlist } = data;
        if (shortlist.length < 2) {
            return res.status(409).json({
                success: false,
                message: "AI ranking needs at least two matching listings within your budget.",
            });
        }

        const inputHash = rankingInputHash(preferences, shortlist);
        const saved = preferences.aiRanking;
        if (saved && saved.inputHash === inputHash && req.body?.refresh !== true) {
            return res.json({ success: true, reused: true, ranking: presentRanking(saved, shortlist), note: NOTE });
        }

        const result = await requestAIRanking({ preferences, shortlist });
        const aiRanking = {
            inputHash,
            model: result.model,
            rankedAt: new Date(),
            overallNote: result.overallNote,
            rankings: result.rankings,
        };
        await RenterPreference.updateOne({ _id: preferences._id }, { $set: { aiRanking } });

        return res.json({ success: true, reused: false, ranking: presentRanking(aiRanking, shortlist), note: NOTE });
    } catch (error) {
        if (error instanceof AIRankingError) {
            console.error("AI ranking error:", error.message);
            return res.status(error.status).json({ success: false, message: error.publicMessage });
        }
        next(error);
    }
}
