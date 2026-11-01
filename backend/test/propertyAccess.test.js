import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import Property from "../src/models/Property.js";
import { manageablePropertyFilter } from "../src/services/propertyAccess.service.js";

const objectId = () => new mongoose.Types.ObjectId();

test("property manager assignments are recorded without becoming public property fields", () => {
    const manager = objectId();
    const assignedBy = objectId();
    const property = new Property({
        landlord: objectId(),
        managerAssignments: [{ manager, assignedBy }],
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
    assert.equal(Property.schema.path("managerAssignments").options.select, false);
    const filter = manageablePropertyFilter(manager);
    assert.deepEqual(filter.$or[1].managerAssignments.$elemMatch, {
        manager,
        revokedAt: null,
    });
});
