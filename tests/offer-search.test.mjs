import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { offerUrlKey, createOfferSearch } from "../frontend/js/offer-search.js";

test("product identity ignores tracking parameters and rejects foreign URLs", () => {
  assert.equal(offerUrlKey("https://www.amazon.it/dp/B0TEST1234?tag=example"), offerUrlKey("https://amazon.it/gp/product/B0TEST1234"));
  assert.equal(offerUrlKey("https://www.ebay.it/itm/name/123456789012"), "eBay:123456789012");
  assert.equal(offerUrlKey("https://it.aliexpress.com/item/1005001234567.html"), "AliExpress:1005001234567");
  assert.equal(offerUrlKey("https://www.alternate.it/old-name/product/123456"), offerUrlKey("https://www.alternate.it/new-name/product/123456"));
  assert.equal(offerUrlKey("https://www.subito.it/informatica/old-name-123456.htm"), offerUrlKey("https://www.subito.it/informatica/new-name-123456.htm"));
  for (const url of ["https://amazon.it.evil.example/dp/B0TEST1234", "javascript:alert(1)", "https://user@amazon.it/dp/B0TEST1234", "https://amazon.it/s?k=cpu"]) assert.equal(offerUrlKey(url), null);
});

test("all search offers reach the save callback; close aborts late results", async () => {
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
  assert.equal(saved.length, 2);
  assert.equal(nodes.get("offerSearchResults").children.length, 2);
  assert.match(nodes.get("offerSearchResults").children[1].children[2].textContent, /Needs verification/);
  globalThis.fetch = () => new Promise(done => { resolve = done; });
  const pending = search.open(part);
  nodes.get("closeOfferSearch").listeners.click();
  resolve({ ok: true, json: async () => ({ offers: [{ url: "https://www.amazon.it/dp/B0TEST1234", verified: true, price: 50, currency: "EUR", condition: "New" }] }) });
  await pending;
  assert.equal(saved.length, 2);
});

test("Build integration preserves manual prices, improves store tags and rejects stale components", async () => {
  const manual = { id: "manual", url: "https://amazon.it/dp/B0TEST1234", price: 120, history: [{ date: "2026-11-01", price: 120 }] };
  const part = { id: 1, name: "AMD Ryzen 7 9700X CPU", category: "CPU", offers: [manual] };
  const before = JSON.stringify(manual);
  let options, saves = 0;
  const context = vm.createContext({
    components: [part], watchlist: [], trash: [], dataReady: true, activeCollection: "build",
    createOfferSearch(value) { options = value; return {}; }, reportClientIssue() {}, offerUrlKey,
    crypto: { randomUUID: () => "test-id" }, today: () => "2026-11-07",
    saveCollectionMutation: async () => { saves++; return true; },
  });
  const source = fs.readFileSync(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  vm.runInContext(source.slice(source.indexOf("const offerSearch = createOfferSearch({"), source.indexOf('$("componentList").addEventListener("click"')), context);
  assert.equal(options.getSearchParts().collection, "build");
  assert.equal(options.getSearchParts().parts[0], part);
  const requested = { id: 1, name: part.name, category: part.category };
  const offers = [
    { store: "Amazon", url: "https://amazon.it/gp/product/B0TEST1234?tag=other", price: 90, currency: "EUR" },
    { store: "eBay", url: "https://www.ebay.it/itm/123456789012", price: 100, currency: "EUR" },
    { store: "Amazon", url: "https://amazon.it/dp/B0OTHER123", price: 110, currency: "EUR" },
  ];
  assert.equal(await options.addVerifiedOffers(requested, offers), 2);
  assert.equal(manual.price, 120);
  assert.equal(JSON.stringify(manual), before);
  assert.equal(manual.history.length, 1);
  assert.equal(part.offers.length, 3);
  assert.equal(await options.addVerifiedOffers(requested, offers), 0);
  assert.equal(saves, 1);
  assert.equal(await options.addVerifiedOffers(requested, [{ ...offers[0], price: 250 }]), 0);
  assert.equal(manual.price, 120);
  const web = part.offers.find(offer => offer.source === "experimental-web-search" && offer.store === "Amazon");
  const originalId = web.id;
  assert.equal(web.price, 90);
  const lower = { ...offers[0], url: "https://amazon.it/dp/B0LOWER123", price: 80, verified: false, condition: "Used" };
  assert.equal(await options.addVerifiedOffers(requested, [lower]), 1);
  assert.equal(web.price, 80);
  assert.equal(web.url, lower.url);
  assert.equal(web.id, originalId);
  assert.equal(web.condition, "Used");
  assert.equal(web.verified, false);
  assert.deepEqual(Array.from(web.history, record => record.price), [90, 80]);
  assert.equal(await options.addVerifiedOffers(requested, [lower, { ...lower, price: 81 }, { ...lower, price: null }]), 0);
  assert.equal(JSON.stringify(manual), before);
  const wished = { id: 2, name: part.name, category: part.category, offers: [] };
  context.watchlist.push(wished);
  assert.equal(await options.addVerifiedOffers({ id: 2, name: wished.name, category: wished.category, collection: "watchlist" }, offers), 2);
  assert.equal(wished.offers.length, 2);
  const missing = { id: "missing", store: "Subito", url: "https://subito.it/informatica/old-123456.htm", source: "experimental-web-search", price: null, history: [] };
  wished.offers.push(missing);
  const wishedRequest = { id: 2, name: wished.name, category: wished.category, collection: "watchlist" };
  assert.equal(await options.addVerifiedOffers(wishedRequest, [{ url: "https://subito.it/informatica/new-123457.htm", price: 50, currency: "EUR" }]), 1);
  assert.equal(missing.price, 50);
  assert.equal(missing.history.length, 1);
  assert.equal(part.offers.length, 3);
  context.activeCollection = "watchlist";
  assert.equal(options.getSearchParts().parts[0], wished);
  assert.equal(options.isCurrentPart(requested), true);
  part.name = "Changed model";
  assert.equal(options.isCurrentPart(requested), false);
  assert.equal(await options.addVerifiedOffers(requested, offers), null);
});

function batchSearchHarness(options = {}) {
  class Element {
    constructor() { this.listeners = {}; this.classList = { add() {}, remove() {} }; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute() {}
    replaceChildren() {}
    focus() {}
  }
  const nodes = new Map();
  globalThis.document = { activeElement: null, getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); } };
  return { search: createOfferSearch({ addVerifiedOffers: async () => 1, reportClientIssue() {}, ...options }), nodes };
}

test("batch searches sequentially, reuses identical models, skips stale parts and continues after errors", async () => {
  let calls = 0, active = 0, maxActive = 0;
  const saved = [], issues = [];
  const parts = [
    { id: 1, name: "AMD Ryzen 7 9700X", category: "CPU" },
    { id: 2, name: "AMD Ryzen 7 9700X", category: "CPU" },
    { id: 3, name: "Failed component", category: "GPU" },
    { id: 4, name: "Samsung 990 PRO 2TB", category: "Storage" },
    { id: 5, name: "Deleted component", category: "CPU" },
  ];
  globalThis.fetch = async (_url, request) => {
    calls++; active++; maxActive = Math.max(active, maxActive);
    const part = JSON.parse(request.body);
    await Promise.resolve();
    active--;
    return { ok: part.id !== 3, json: async () => part.id === 3 ? { error: "provider unavailable" } : { offers: [{ url: "https://amazon.it/dp/B0TEST1234", price: null }, { url: "https://outside.example/product" }] } };
  };
  const { search, nodes } = batchSearchHarness({
    isCurrentPart: part => part.id !== 5,
    addVerifiedOffers: async (part, offers) => { saved.push([part.id, part.collection, offers.length]); return 1; },
    reportClientIssue: (...args) => issues.push(args),
  });
  const pending = search.searchAll([...parts, parts[0]], "watchlist");
  assert.equal(nodes.get("searchAllOffers").disabled, true);
  assert.match(nodes.get("allOffersStatus").textContent, /0\/5 components/);
  await search.searchAll(parts);
  await search.open(parts[0]);
  await pending;
  assert.equal(calls, 3);
  assert.equal(maxActive, 1);
  assert.deepEqual(saved, [[1, "watchlist", 1], [2, "watchlist", 1], [4, "watchlist", 1]]);
  assert.equal(issues.length, 1);
  assert.match(nodes.get("allOffersStatus").textContent, /completed: 5\/5 components · 1 errors/);
  assert.equal(nodes.get("searchAllOffers").disabled, false);
  assert.equal(nodes.get("stopAllOffers").hidden, true);
});

test("stop finishes the current component, skips remaining searches and allows a fresh run", async () => {
  let resolve, calls = 0, saved = 0;
  const part = { id: 1, name: "AMD Ryzen 7 9700X", category: "CPU" };
  globalThis.fetch = () => { calls++; return new Promise(done => { resolve = done; }); };
  const { search, nodes } = batchSearchHarness({ addVerifiedOffers: async () => { saved++; return 1; } });
  const pending = search.searchAll([part, { ...part, id: 2, name: "Other model" }]);
  nodes.get("stopAllOffers").listeners.click();
  assert.match(nodes.get("allOffersStatus").textContent, /Stopping/);
  resolve({ ok: true, json: async () => ({ offers: [{ url: "https://amazon.it/dp/B0TEST1234" }] }) });
  await pending;
  assert.equal(calls, 1);
  assert.equal(saved, 1);
  assert.match(nodes.get("allOffersStatus").textContent, /stopped: 1\/2/);
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ offers: [] }) }; };
  await search.searchAll([part]);
  assert.equal(calls, 2);
  assert.match(nodes.get("allOffersStatus").textContent, /completed: 1\/1/);
});

test("batch ignores a component edited during its request and continues after a save failure", async () => {
  let resolve, current = true, calls = 0;
  const saved = [];
  const parts = [1, 2, 3].map(id => ({ id, name: `Model ${id}`, category: "CPU" }));
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) await new Promise(done => { resolve = done; });
    return { ok: true, json: async () => ({ offers: [{ url: "https://amazon.it/dp/B0TEST1234" }] }) };
  };
  const { search, nodes } = batchSearchHarness({
    isCurrentPart: part => part.id !== 1 || current,
    addVerifiedOffers: async part => { saved.push(part.id); return part.id === 2 ? null : 1; },
  });
  const pending = search.searchAll(parts);
  current = false;
  resolve();
  await pending;
  assert.equal(calls, 3);
  assert.deepEqual(saved, [2, 3]);
  assert.match(nodes.get("allOffersStatus").textContent, /completed: 3\/3 components · 1 errors/);
});
