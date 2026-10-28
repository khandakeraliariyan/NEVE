
function getKnownUpfrontCosts(pricing = {}) {
    const components = {
        securityDeposit: pricing.securityDeposit,
        advanceRent: pricing.advanceRent,
        oneTimeFees: pricing.oneTimeFees
    };

    const missingComponents = Object.entries(components)
        .filter(([, value]) => value == null)
        .map(([key]) => key);

    const total = missingComponents.length
        ? null
        : Object.values(components).reduce(
            (sum, value) => sum + value,
            0
        );

    return {
        components,
        total,
        complete: missingComponents.length === 0,
        missingComponents
    };
}

export function buildPropertyComparison(properties) {
    return properties.map((property) => {
        const item = property.toObject();

        return {
            id: item._id,
            title: item.title,
            description: item.description,
            propertyType: item.propertyType,
            address: item.address,
            bedrooms: item.bedrooms,
            bathrooms: item.bathrooms,
            areaSqft: item.areaSqft,
            floor: item.floor,
            furnishing: item.furnishing,
            amenities: item.amenities ?? [],
            images: item.images ?? [],
            availabilityDate: item.availabilityDate,
            leaseDurationMonths: item.leaseDurationMonths,
            pricing: {
                monthlyRent: item.pricing?.monthlyRent ?? null,
                monthlyServiceCharge:
                    item.pricing?.monthlyServiceCharge ?? null,
                estimatedMonthlyUtilities:
                    item.pricing?.estimatedMonthlyUtilities ?? null,
                upfrontCosts: getKnownUpfrontCosts(item.pricing)
            }
        };
    });
}
