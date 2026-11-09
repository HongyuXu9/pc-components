import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { resolveStoreName } from "../frontend/js/domain.js";

const source = fs.readFileSync(new URL("../frontend/js/app.js", import.meta.url), "utf8");
const editSource = source.slice(source.indexOf("async function editOffer("), source.indexOf("function addOffer("));
function setup(collection = "components") {
  const offer = { id: "offer", store: "Amazon", url: "https://amazon.it/dp/B0TEST1234", condition: "Unknown", price: 309.87, source: "experimental-web-search", verified: true, checkedAt: "old", history: [{ date: "2026-11-01", price: 320 }, { date: "2026-11-02", price: 309.87 }] };
  const part = { id: "part", offers: [offer] };
  let result = { store: "eBay", url: "https://ebay.it/itm/123456789012", condition: "Used", price: "400" };
  const saves = [], notices = [];
  const context = vm.createContext({
    components: collection === "components" ? [part] : [], watchlist: collection === "watchlist" ? [part] : [], trash: [], dataReady: true,
    URL, resolveStoreName, today: () => "2026-11-09", openActionDialog: async () => typeof result === "function" ? result() : result,
    saveCollectionMutation: async snapshot => { saves.push(JSON.parse(snapshot)); return true; }, notify: message => notices.push(message),
  });
  vm.runInContext(editSource, context);
  return { offer, part, saves, notices, context, answer(value) { result = value; }, edit: () => context.editOffer("part", "offer", collection) };
}

test("offer corrections work in Build and Watchlist, preserve earlier history and become manual", async () => {
  for (const collection of ["components", "watchlist"]) {
    const state = setup(collection);
    await state.edit();
    assert.equal(state.offer.price, 400); // A correction may raise a wrong search price.
    assert.equal(state.offer.store, "eBay");
    assert.equal(state.offer.condition, "Used");
    assert.equal(state.offer.url, "https://ebay.it/itm/123456789012");
    assert.equal(state.offer.source, "manual");
    assert.equal(state.offer.verified, false);
    assert.equal(state.offer.checkedAt, undefined);
    assert.deepEqual(state.offer.history, [{ date: "2026-11-01", price: 320 }, { date: "2026-11-02", price: 400 }]);
    assert.equal(state.saves[0][collection][0].offers[0].price, 309.87);
    state.answer({ store: "eBay", url: "", condition: "Unknown", price: "" });
    await state.edit();
    assert.equal(state.offer.price, null);
    assert.equal(state.offer.history.length, 1);
  }
});

test("cancel, unsafe links, invalid prices and concurrent offer changes do not save stale edits", async () => {
  for (const result of [null, { store: "Amazon", url: "javascript:alert(1)", condition: "New", price: "1" }, { store: "Amazon", url: "", condition: "New", price: "-1" }]) {
    const state = setup();
    const before = JSON.stringify(state.offer);
    state.answer(result);
    await state.edit();
    assert.equal(JSON.stringify(state.offer), before);
    assert.equal(state.saves.length, 0);
  }
  const state = setup();
  state.answer(() => { state.offer.price = 300; return { store: "Amazon", url: "", condition: "New", price: "200" }; });
  await state.edit();
  assert.equal(state.offer.price, 300);
  assert.equal(state.saves.length, 0);
  assert.match(state.notices[0], /Offer changed/);
});
