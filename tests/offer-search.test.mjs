import assert from "node:assert/strict";
import test from "node:test";
import { offerSearchEligibility, offerUrlKey, createOfferSearch } from "../js/offer-search.js";

test("precise identities are required, with RAM/storage variant details", () => {
  assert.ok(offerSearchEligibility({ name: "Corsair RAM", category: "RAM" }));
  assert.ok(offerSearchEligibility({ name: "Corsair Vengeance DDR5 32GB", category: "RAM" }));
  assert.equal(offerSearchEligibility({ name: "Corsair Vengeance DDR5 32GB 6000MHz CL36", category: "RAM" }), "");
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
