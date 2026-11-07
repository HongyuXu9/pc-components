import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { offerSearchEligibility, offerUrlKey, createOfferSearch } from "../frontend/js/offer-search.js";

test("precise identities are required, with RAM/storage variant details", () => {
  assert.ok(offerSearchEligibility({ name: "Corsair RAM", category: "RAM" }));
  assert.ok(offerSearchEligibility({ name: "Corsair Vengeance DDR5 32GB", category: "RAM" }));
  assert.ok(offerSearchEligibility({ name: "Corsair Vengeance DDR5 32GB 6000MHz CL36", category: "RAM" }));
  assert.equal(offerSearchEligibility({ name: "Corsair Vengeance DDR5 2x16GB 6000MHz CL36", category: "RAM" }), "");
  assert.ok(offerSearchEligibility({ name: "Samsung monitor 27", category: "Monitor" }));
  assert.equal(offerSearchEligibility({ name: "AMD Ryzen 7 9700X CPU", category: "CPU" }), "");
});

test("product identity ignores tracking parameters and rejects foreign URLs", () => {
  assert.equal(offerUrlKey("https://www.amazon.it/dp/B0TEST1234?tag=example"), offerUrlKey("https://amazon.it/gp/product/B0TEST1234"));
  assert.equal(offerUrlKey("https://www.ebay.it/itm/name/123456789012"), "eBay:123456789012");
  assert.equal(offerUrlKey("https://it.aliexpress.com/item/1005001234567.html"), "AliExpress:1005001234567");
  for (const url of ["https://amazon.it.evil.example/dp/B0TEST1234", "javascript:alert(1)", "https://user@amazon.it/dp/B0TEST1234", "https://amazon.it/s?k=cpu"]) assert.equal(offerUrlKey(url), null);
});

test("only verified EUR new offers reach the save callback; close aborts late results", async () => {
  class Element {
    constructor() { this.listeners = {}; this.children = []; this.classList = { add() {}, remove() {} }; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    replaceChildren() { this.children = []; }
    append(...children) { this.children.push(...children); }
    setAttribute() {}
    focus() {}
  }
  const nodes = new Map();
  globalThis.document = { activeElement: null, getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); }, createElement() { return new Element(); } };
  let saved = [], resolve;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ offers: [
    { url: "https://www.amazon.it/dp/B0TEST1234", store: "Amazon", verified: true, price: 100, currency: "EUR", condition: "New" },
    { url: "https://www.ebay.it/itm/123456789012", verified: false, price: null },
  ] }) });
  const search = createOfferSearch({ addVerifiedOffers: async (_part, offers) => { saved.push(...offers); return offers.length; }, reportClientIssue() {} });
  const part = { id: 1, name: "AMD Ryzen 7 9700X CPU", category: "CPU" };
  await search.open(part);
  assert.equal(saved.length, 1);
  assert.equal(nodes.get("offerSearchResults").children.length, 2);
  globalThis.fetch = () => new Promise(done => { resolve = done; });
  const pending = search.open(part);
  nodes.get("closeOfferSearch").listeners.click();
  resolve({ ok: true, json: async () => ({ offers: [{ url: "https://www.amazon.it/dp/B0TEST1234", verified: true, price: 50, currency: "EUR", condition: "New" }] }) });
  await pending;
  assert.equal(saved.length, 1);
});

test("Build integration preserves manual prices, skips duplicate products and rejects stale components", async () => {
  const manual = { id: "manual", url: "https://amazon.it/dp/B0TEST1234", price: 120, history: [{ date: "2026-11-01", price: 120 }] };
  const part = { id: 1, name: "AMD Ryzen 7 9700X CPU", category: "CPU", offers: [manual] };
  const before = JSON.stringify(manual);
  let options, saves = 0;
  const context = vm.createContext({
    components: [part], watchlist: [], trash: [], dataReady: true,
    createOfferSearch(value) { options = value; return {}; }, reportClientIssue() {}, offerUrlKey,
    crypto: { randomUUID: () => "test-id" }, today: () => "2026-11-07",
    saveCollectionMutation: async () => { saves++; return true; },
  });
  const source = fs.readFileSync(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  vm.runInContext(source.slice(source.indexOf("const offerSearch = createOfferSearch({"), source.indexOf('$("componentList").addEventListener("click"')), context);
  const requested = { id: 1, name: part.name, category: part.category };
  const offers = [
    { store: "Amazon", url: "https://amazon.it/gp/product/B0TEST1234?tag=other", price: 90 },
    { store: "eBay", url: "https://www.ebay.it/itm/123456789012", price: 100 },
  ];
  assert.equal(await options.addVerifiedOffers(requested, offers), 1);
  assert.equal(JSON.stringify(manual), before);
  assert.equal(part.offers.length, 2);
  assert.equal(await options.addVerifiedOffers(requested, offers), 0);
  assert.equal(saves, 1);
  part.name = "Changed model";
  assert.equal(await options.addVerifiedOffers(requested, offers), null);
});
