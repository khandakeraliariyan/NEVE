
const CATEGORY_LABELS = {
    healthcare: "Healthcare",
    education: "Education",
    groceries: "Groceries",
    transport: "Public transport",
    banking: "Banks and ATMs",
    recreation: "Parks and recreation",
    food: "Restaurants and cafes",
    other: "Other places"
};

export function buildNeighborhoodInsights(places = []) {
    const counts = Object.fromEntries(
        Object.keys(CATEGORY_LABELS).map((category) => [
            category,
            0
        ])
    );

    for (const place of places) {
        if (Object.hasOwn(counts, place.category)) {
            counts[place.category] += 1;
        }
    }

    const categories = Object.entries(CATEGORY_LABELS).map(
        ([key, label]) => ({
            category: key,
            label,
            count: counts[key]
        })
    );

    const availableCategories = categories.filter(
        (item) => item.count > 0
    );

    const highlights = availableCategories
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((item) => ({
            category: item.category,
            message: `${item.count} mapped ${item.label.toLowerCase()
                } place${item.count === 1 ? "" : "s"} found`
        }));

    return {
        mappedPlacesReturned: places.length,
        categories,
        highlights,
        summary:
            places.length === 0
                ? "No nearby places were returned by the map data provider. This does not confirm that the area has no facilities."
                : `${places.length} mapped nearby places were returned. Review the category counts to understand the available map data.`,
        limitations: [
            "Counts reflect returned OpenStreetMap results, not a complete inventory.",
            "Results are limited to the requested radius and the provider's available data.",
            "Place counts do not measure neighborhood safety, quality, or suitability.",
            "Distances are straight-line estimates, not travel times."
        ]
    };
}
