import Property from "../models/Property.js";

// Only the property's landlord can manage it.
export function manageablePropertyFilter(userId) {
    return { landlord: userId };
}

export async function canManageProperty(property, userId) {
    const propertyId = property?._id ?? property;
    if (!propertyId || !userId) return false;
    if (property?.landlord) {
        return (
            String(property.landlord?._id ?? property.landlord) ===
            String(userId)
        );
    }

    return Boolean(
        await Property.exists({ _id: propertyId, landlord: userId })
    );
}

export async function getManageablePropertyIds(userId) {
    return Property.find(manageablePropertyFilter(userId)).distinct("_id");
}
