import Property from "../models/Property.js";

export function manageablePropertyFilter(userId) {
    return {
        $or: [
            { landlord: userId },
            {
                managerAssignments: {
                    $elemMatch: { manager: userId, revokedAt: null },
                },
            },
        ],
    };
}

export async function canManageProperty(property, userId) {
    const propertyId = property?._id ?? property;
    if (!propertyId || !userId) return false;
    if (
        property?.landlord &&
        String(property.landlord?._id ?? property.landlord) === String(userId)
    ) {
        return true;
    }

    return Boolean(
        await Property.exists({
            _id: propertyId,
            managerAssignments: {
                $elemMatch: { manager: userId, revokedAt: null },
            },
        })
    );
}

export async function getManageablePropertyIds(userId) {
    return Property.find(manageablePropertyFilter(userId)).distinct("_id");
}
