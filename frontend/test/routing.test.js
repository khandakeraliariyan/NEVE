import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { clearRoutingCache, getRoute, getTravelTimes } from "../src/server/services/routing.service.js";

beforeEach(() => clearRoutingCache());

const from = { latitude: 23.7461, longitude: 90.3742 };
const to = { latitude: 23.75, longitude: 90.38 };

function fakeFetch(payload, { ok = true, status = 200 } = {}) {
    const calls = [];
    const impl = async (url) => {
        calls.push(url);
        return { ok, status, json: async () => payload };
    };
    impl.calls = calls;
    return impl;
}

test("returns route distance and time, then serves it from cache", async () => {
    const fetchImpl = fakeFetch({ code: "Ok", routes: [{ distance: 1234.4, duration: 900, geometry: { type: "LineString", coordinates: [] } }] });
    const route = await getRoute({ from, to, mode: "walking", includeGeometry: true, fetchImpl });
    assert.equal(route.distanceMeters, 1234);
    assert.equal(route.durationMinutes, 15);
    assert.equal(route.geometry.type, "LineString");
    assert.match(fetchImpl.calls[0], /\/route\/v1\/foot\/90\.374200,23\.746100;90\.380000,23\.750000/);

    const again = await getRoute({ from, to, mode: "walking", includeGeometry: true, fetchImpl });
    assert.equal(again.cached, true);
    assert.equal(fetchImpl.calls.length, 1);
});

test("NoRoute is a 422 and provider failures are 502", async () => {
    await assert.rejects(getRoute({ from, to, mode: "driving", fetchImpl: fakeFetch({ code: "NoRoute" }) }), { status: 422 });
    await assert.rejects(getRoute({ from, to, mode: "driving", fetchImpl: fakeFetch({}, { ok: false, status: 503 }) }), { status: 502 });
    await assert.rejects(getRoute({ from, to, mode: "flying" }), { status: 400 });
});

test("times several destinations in one table request", async () => {
    const fetchImpl = fakeFetch({ code: "Ok", durations: [[0, 120, null]], distances: [[0, 500, null]] });
    const places = await getTravelTimes({
        from,
        destinations: [{ name: "School", ...to }, { name: "Island", latitude: 23.8, longitude: 90.5 }],
        mode: "driving",
        fetchImpl,
    });
    assert.equal(places[0].travelDurationMinutes, 2);
    assert.equal(places[0].reachable, true);
    assert.equal(places[1].reachable, false);
    assert.match(fetchImpl.calls[0], /\/table\/v1\/driving\/.*sources=0/);
});
