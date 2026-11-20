import assert from "node:assert/strict";
import test from "node:test";

import Property from "../src/server/models/Property.js";
import { buildPropertySearchFilter } from "../src/server/services/propertySearch.service.js";

function errorsFor(fields) {
    const property = new Property({
        title: "Room",
        description: "A room",
        address: { area: "Dhanmondi", city: "Dhaka" },
        bedrooms: 1,
        bathrooms: 1,
        landlord: "507f1f77bcf86cd799439011",
        ...fields,
    });
    return property.validate().then(() => ({}), (error) => error.errors);
}

test("room and shared_room are valid property types", async () => {
    for (const propertyType of ["room", "shared_room"]) {
        const errors = await errorsFor({ propertyType });
        assert.equal(errors.propertyType, undefined, propertyType);
    }
});

test("accepts shared accommodation details on a shared room", async () => {
    const errors = await errorsFor({
        propertyType: "shared_room",
        sharedAccommodation: { totalOccupants: 3, availableSpots: 1, occupantGender: "female", sharedFacilities: ["kitchen"] },
    });
    assert.equal(errors.sharedAccommodation, undefined);
});

test("rejects more spots than occupants", async () => {
    const errors = await errorsFor({
        propertyType: "room",
        sharedAccommodation: { totalOccupants: 2, availableSpots: 3 },
    });
    assert.ok(errors.sharedAccommodation);
});

test("rejects shared accommodation on an apartment", async () => {
    const errors = await errorsFor({
        propertyType: "apartment",
        sharedAccommodation: { totalOccupants: 2, availableSpots: 1 },
    });
    assert.ok(errors.sharedAccommodation);
});

test("search filters on gender, bathroom and spots", () => {
    const filter = buildPropertySearchFilter({ propertyType: "shared_room", occupantGender: "female", bathroomType: "shared", minAvailableSpots: 2 });
    assert.equal(filter.propertyType, "shared_room");
    assert.deepEqual(filter["sharedAccommodation.occupantGender"], { $in: ["female", "any"] });
    assert.equal(filter["sharedAccommodation.bathroomType"], "shared");
    assert.deepEqual(filter["sharedAccommodation.availableSpots"], { $gte: 2 });
});
