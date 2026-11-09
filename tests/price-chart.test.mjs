import test from "node:test";
import assert from "node:assert/strict";
import { priceTimeline } from "../frontend/js/price-chart.js";

test("carries prices to today without changing recorded history", () => {
  const offers = [{ history: [{date: "2026-11-01", price: 190}, {date: "2026-11-03", price: 180}] },
    {history: [{date: "2026-11-02", price: 200}]}];
  const original = JSON.stringify(offers);
  const result = priceTimeline(offers, "2026-11-05");
  assert.deepEqual(result.series, [[190,190,180,180,180],[null,200,200,200,200]]);
  assert.equal(result.dates.at(-1), "2026-11-05");
  assert.equal(JSON.stringify(offers), original);
});
test("handles a single old price and month boundaries", () => {
  const result = priceTimeline([{history: [{date: "2026-10-31", price: 100}]}], "2026-11-02");
  assert.deepEqual(result.dates, ["2026-10-31","2026-11-01","2026-11-02"]);
  assert.deepEqual(result.series, [[100,100,100]]);
  assert.deepEqual(priceTimeline([], "2026-11-02").dates, []);
});
