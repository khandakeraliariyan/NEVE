import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import Property from "../src/models/Property.js";
import { manageablePropertyFilter } from "../src/services/propertyAccess.service.js";

const objectId = () => new mongoose.Types.ObjectId();

test("only the landlord can manage a property", () => {
    const landlord = objectId();
    const property = new Property({
        landlord,
        title: "Sunny apartment",
        description: "A property description.",
        propertyType: "apartment",
        address: { area: "Dhanmondi", city: "Dhaka" },
        bedrooms: 2,
        bathrooms: 1,
        furnishing: "furnished",
        pricing: { monthlyRent: 25000 },
    });

    assert.equal(property.validateSync(), undefined);
    assert.equal(Property.schema.path("managerAssignments"), undefined);
    assert.deepEqual(manageablePropertyFilter(landlord), { landlord });
});
