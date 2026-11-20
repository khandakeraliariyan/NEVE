import Property from "../models/Property.js";

export async function findPubliclyAvailableProperty(propertyId) {
  const property = await Property.findOne({
    _id: propertyId,
    status: "published",
  });

  return property;
}
