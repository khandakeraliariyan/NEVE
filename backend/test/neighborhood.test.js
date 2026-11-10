import assert from "node:assert/strict";
import test from "node:test";

process.env.CLIENT_URL ||= "http://localhost:3000";
process.env.MONGODB_URI ||= "mongodb://localhost/neve-test";
process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||= "test-service-account.json";
process.env.OVERPASS_API_URL = "https://first.example/api/interpreter, https://second.example/api/interpreter";

const {
    calculateDistanceMeters,
    categorizePlace,
    fetchNearbyElements,
    findNearbyPlaces,
    MAP_DATA_UNAVAILABLE,
    isNearbyCacheFresh,
    normalizeNeighborhoodPlace,
} = await import("../src/services/neighborhood.service.js");

test("nearby places are assigned to the supported neighborhood categories", () => {
    assert.equal(categorizePlace({ amenity: "pharmacy" }), "healthcare");
    assert.equal(categorizePlace({ amenity: "kindergarten" }), "education");
    assert.equal(categorizePlace({ shop: "supermarket" }), "groceries");
    assert.equal(categorizePlace({ highway: "bus_stop" }), "transport");
    assert.equal(categorizePlace({ amenity: "atm" }), "banking");
    assert.equal(categorizePlace({ leisure: "park" }), "recreation");
    assert.equal(categorizePlace({ amenity: "restaurant" }), "food");
    assert.equal(categorizePlace({ amenity: "library" }), "other");
});

test("nearby distances use a straight-line haversine estimate", () => {
    assert.equal(calculateDistanceMeters(0, 0, 0, 0), 0);
    assert.equal(calculateDistanceMeters(0, 0, 1, 0), 111195);
});

test("legacy nearby cache categories are normalized", () => {
    assert.deepEqual(
        normalizeNeighborhoodPlace({
            category: "school",
            distanceMeters: 1350,
        }),
        {
            category: "education",
            distanceMeters: 1350,
            distanceKm: 1.35,
        }
    );
});

test("nearby-place cache must match its center and requested radius", () => {
    const cache = {
        centerLatitude: 23.8,
        centerLongitude: 90.4,
        radiusMeters: 2000,
        fetchedAt: new Date(),
        places: [],
    };

    assert.equal(
        isNearbyCacheFresh(cache, {
            latitude: 23.8,
            longitude: 90.4,
            radius: 1000,
        }),
        true
    );
    assert.equal(
        isNearbyCacheFresh(cache, {
            latitude: 23.81,
            longitude: 90.4,
            radius: 1000,
        }),
        false
    );
    assert.equal(
        isNearbyCacheFresh(cache, {
            latitude: 23.8,
            longitude: 90.4,
            radius: 3000,
        }),
        false
    );
});

test("nearby searches reject invalid coordinates, radius, and category", async () => {
    await assert.rejects(
        findNearbyPlaces({ latitude: 91, longitude: 90 }),
        { status: 400 }
    );
    await assert.rejects(
        findNearbyPlaces({
            latitude: 23.8,
            longitude: 90.4,
            radius: 99,
        }),
        { status: 400 }
    );
    await assert.rejects(
        findNearbyPlaces({
            latitude: 23.8,
            longitude: 90.4,
            category: "unlisted",
        }),
        { status: 400 }
    );
});

test("nearby places try the next Overpass server when one fails", async () => {
    const asked = [];
    const fakeFetch = async (url) => {
        asked.push(new URL(url).host);
        if (url.includes("first")) return new Response("busy", { status: 504 });
        return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
    };
    const elements = await fetchNearbyElements({ latitude: 23.78, longitude: 90.4, radius: 500 }, fakeFetch);
    assert.deepEqual(elements, [{ id: 1 }]);
    assert.deepEqual(asked, ["first.example", "second.example"]);
});

test("when every Overpass server fails the error has a plain public message", async () => {
    const fakeFetch = async () => {
        throw new TypeError("fetch failed");
    };
    await assert.rejects(
        fetchNearbyElements({ latitude: 23.78, longitude: 90.4, radius: 500 }, fakeFetch),
        (error) => {
            assert.equal(error.status, 502);
            assert.equal(error.publicMessage, MAP_DATA_UNAVAILABLE);
            assert.match(error.message, /first\.example: unreachable; second\.example: unreachable/);
            return true;
        }
    );
});
