"""Run with: python -m unittest discover -s tests -p test_offer_search.py"""
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from partly_server import offer_search as search


NAME = "AMD Ryzen 7 9700X CPU"
URL = "https://www.amazon.it/dp/B0TEST1234"


def page(**changes):
    offer = {"@type": "Offer", "price": "199.99", "priceCurrency": "EUR", "availability": "https://schema.org/InStock", "itemCondition": "https://schema.org/NewCondition", "url": URL}
    offer.update(changes)
    return '<script type="application/ld+json">' + json.dumps({"@type": "Product", "name": NAME, "offers": offer}) + '</script>'


class OfferSearchTests(unittest.TestCase):
    def test_search_prices(self):
        self.assertEqual(search.snippet_price("EUR 250,00"), 250)
        self.assertEqual(search.snippet_price("€1.234,56"), 1234.56)
        self.assertEqual(search.snippet_price("199.99 EUR"), 199.99)
        self.assertIsNone(search.snippet_price("9700X 250 dollars"))

    def test_price_quotes_reject_ambiguous_or_non_product_amounts(self):
        for quote in ["Sconto EUR 20", "Coupon EUR 15", "3 rate da EUR 60", "Shipping EUR 5", "Spedizione EUR 7", "EUR 200 invece di EUR 250", "EUR 100 / EUR 200", "Risparmia EUR 30"]:
            with self.subTest(quote=quote):
                self.assertIsNone(search.snippet_price(quote))

    def test_price_context_allows_discounted_selling_price_and_free_shipping(self):
        for quote in ["Prezzo in sconto EUR 200", "Prezzo dopo sconto EUR 200", "Prezzo prodotto EUR 200 con spedizione gratuita", "Sconto disponibile; prezzo EUR 200, spedizione inclusa", "Spedizione gratuita. Prezzo EUR 200"]:
            with self.subTest(quote=quote):
                self.assertEqual(search.snippet_price(quote), 200)
        for quote in ["EUR 20 di sconto", "EUR 5 per spedizione", "EUR 20/mese", "EUR 200 con coupon"]:
            with self.subTest(quote=quote):
                self.assertIsNone(search.snippet_price(quote))

    def test_incomplete_title_reaches_gemini_but_final_page_model_stays_strict(self):
        listing = {"title": "Ryzen 7 9700X", "url": URL, "content": "Processore AMD Ryzen 7 9700X, prezzo EUR 200"}
        wrong = {"title": "AMD Ryzen 7 9700X3D", "url": "https://amazon.it/dp/B0WRONG123"}
        tavily = unittest.mock.MagicMock()
        tavily.__enter__.return_value.read.return_value = json.dumps({"results": [listing, wrong]}).encode()
        gemini = unittest.mock.MagicMock()
        gemini.__enter__.return_value.read.return_value = json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps({"selected": [{"id": 0, "price_evidence": "prezzo EUR 200"}]})}]}}]}).encode()
        with patch.object(search, "load_key", return_value="test"), patch.object(search, "read_page", return_value=(URL, page().replace("9700X CPU", "9700X3D CPU"))), patch.object(search.urllib.request, "urlopen", side_effect=lambda request, **kwargs: gemini if "generativelanguage" in request.full_url else tavily) as call:
            offers = search.search_offers(NAME, "CPU")["offers"]
        self.assertEqual(len(offers), 1)
        self.assertEqual(offers[0]["price"], 200)
        self.assertFalse(offers[0]["verified"])
        gemini_calls = [entry for entry in call.call_args_list if "generativelanguage" in entry.args[0].full_url]
        self.assertEqual(len(gemini_calls), 1)
        prompt = json.loads(gemini_calls[0].args[0].data)["contents"][0]["parts"][0]["text"]
        self.assertIn("Ryzen 7 9700X", prompt)
        self.assertIn("9700X3D", prompt)
        with patch.object(search, "load_key", return_value=""):
            self.assertEqual(search.refine_candidates(NAME, [listing, wrong]), [])
        with patch.object(search, "load_key", return_value="test"), patch.object(search.urllib.request, "urlopen", side_effect=OSError("unavailable")):
            self.assertEqual(search.refine_candidates(NAME, [listing, wrong]), [])

    def test_gemini_selects_product_prices_in_one_batch(self):
        cases = [
            ("Prezzo EUR 200. Sconto EUR 20", "Prezzo EUR 200", 200),
            ("Prezzo EUR 210. Coupon EUR 15; con coupon EUR 195", "Prezzo EUR 210", 210),
            ("3 rate da EUR 70. Prezzo totale EUR 210", "Prezzo totale EUR 210", 210),
            ("Spedizione EUR 5. Prezzo prodotto EUR 220", "Prezzo prodotto EUR 220", 220),
            ("Prima EUR 300. Ora EUR 240. Risparmia EUR 60", "Ora EUR 240", 240),
            ("Coupon EUR 20; 3 rate da EUR 50; spedizione EUR 5", "", None),
            ("Prezzo EUR 200 oppure EUR 250", "Prezzo EUR 200 oppure EUR 250", None),
            ("Coupon EUR 20", "Coupon EUR 20", None),
            ("Prezzo EUR 200", "Prezzo EUR 1", None),
        ]
        candidates = [{"title": NAME, "url": URL, "content": text} for text, _, _ in cases]
        candidates.append({"title": "AMD Ryzen 7 9700X3D", "url": URL})
        selected = [{"id": i, "price_evidence": quote} for i, (_, quote, _) in enumerate(cases)]
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps({"selected": selected})}]}}]}).encode()
        with patch.object(search, "load_key", return_value="test"), patch.object(search.urllib.request, "urlopen", return_value=response) as call:
            result = search.refine_candidates(NAME, candidates)
        call.assert_called_once()
        self.assertEqual(len(result), len(cases))
        self.assertEqual([item.get("selected_price") for item in result], [price for _, _, price in cases])
        prompt = json.loads(call.call_args.args[0].data)["contents"][0]["parts"][0]["text"]
        for requirement in ["exact model", "coupons", "installment", "shipping", "unverified"]:
            self.assertIn(requirement, prompt)

    def test_page_price_wins_and_missing_gemini_price_stays_null(self):
        listings = [{"title": NAME, "url": URL, "content": "Prezzo EUR 250. Coupon EUR 20. Spedizione EUR 5", "selected_price": 5}]
        tavily = unittest.mock.MagicMock()
        tavily.__enter__.return_value.read.return_value = json.dumps({"results": listings}).encode()
        gemini = unittest.mock.MagicMock()
        def selection(quote):
            return json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps({"selected": [{"id": 0, "price_evidence": quote}]})}]}}]}).encode()
        with patch.object(search, "load_key", return_value="test"), patch.object(search, "read_page", return_value=(URL, page())) as read, patch.object(search.urllib.request, "urlopen", side_effect=lambda request, **kwargs: gemini if "generativelanguage" in request.full_url else tavily) as call:
            gemini.__enter__.return_value.read.return_value = selection("Prezzo EUR 250")
            offer = search.search_offers(NAME, "CPU")["offers"][0]
            self.assertEqual(offer["price"], 199.99)
            self.assertTrue(offer["verified"])
            self.assertEqual(sum("generativelanguage" in entry.args[0].full_url for entry in call.call_args_list), 1)
            read.side_effect = OSError("blocked")
            offer = search.search_offers(NAME, "CPU")["offers"][0]
            self.assertEqual(offer["price"], 250)
            self.assertFalse(offer["verified"])
            gemini.__enter__.return_value.read.return_value = selection("")
            self.assertIsNone(search.search_offers(NAME, "CPU")["offers"][0]["price"])
            gemini.__enter__.return_value.read.side_effect = OSError("Gemini unavailable")
            self.assertIsNone(search.search_offers(NAME, "CPU")["offers"][0]["price"])
            with patch.object(search, "load_key", side_effect=lambda variable="TAVILY_API_KEY": "test" if variable == "TAVILY_API_KEY" else ""):
                self.assertIsNone(search.search_offers(NAME, "CPU")["offers"][0]["price"])

    def test_urls_and_redirect_boundaries(self):
        self.assertEqual(search.product_key("https://alternate.it/old-name/product/123456"), search.product_key("https://alternate.it/new-name/product/123456"))
        self.assertEqual(search.product_key(URL), ("Amazon", "B0TEST1234"))
        for url in ["https://amazon.it.evil.example/dp/B0TEST1234", "http://amazon.it/dp/B0TEST1234", "https://user@amazon.it/dp/B0TEST1234", "https://amazon.it:8080/dp/B0TEST1234", "https://127.0.0.1/private", "https://unsupported.example/product"]:
            self.assertFalse(search.allowed_fetch(url))
        self.assertTrue(search.allowed_fetch(URL))
        self.assertIsNone(search.product_key("https://www.amazon.it/s?k=cpu"))

    def test_exact_variant_not_neighboring_model(self):
        self.assertTrue(search.exact_identity(NAME, "AMD Ryzen 7 9700X Processor"))
        self.assertFalse(search.exact_identity(NAME, "AMD Ryzen 7 9700X3D CPU"))
        self.assertFalse(search.exact_identity(NAME, "AMD Ryzen 7 9800X CPU"))
        self.assertFalse(search.exact_identity(NAME, "AMD Ryzen 7 9700X CPU bundle"))
        self.assertTrue(search.exact_identity("Corsair DDR5 32GB 6000MHz CL36", "Corsair DDR5 32 GB 6000 MHz CL 36"))

    def test_price_requires_new_stock_euro_and_same_product(self):
        identity = search.product_key(URL)
        self.assertEqual(search.verified_price(page(), NAME, identity), 199.99)
        for changes in [{"itemCondition": "UsedCondition"}, {"availability": "OutOfStock"}, {"priceCurrency": "USD"}, {"price": "NaN"}, {"price": "-2"}, {"url": "https://www.amazon.it/dp/B0OTHER123"}, {"@type": "AggregateOffer"}]:
            self.assertIsNone(search.verified_price(page(**changes), NAME, identity))
        self.assertIsNone(search.verified_price(page().replace("9700X CPU", "9700X3D CPU"), NAME, identity))
        self.assertIsNone(search.verified_price("<html>CAPTCHA</html>", NAME, identity))

    def test_tavily_results_only_auto_verify(self):
        response = {"results": [{"title": NAME, "url": URL}]}
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): return json.dumps(response).encode()
        with patch.object(search, "load_key", side_effect=lambda variable="TAVILY_API_KEY": "test-secret" if variable == "TAVILY_API_KEY" else ""), patch.object(search.urllib.request, "urlopen", return_value=Response()), patch.object(search, "read_page", return_value=(URL, page())):
            result = search.search_offers(NAME, "CPU")
            self.assertTrue(result["offers"][0]["verified"])
            self.assertEqual(result["offers"][0]["price"], 199.99)
            response["results"] = []
            result = search.search_offers(NAME, "CPU")
            self.assertEqual(result["offers"], [])

    def test_multiple_products_conditions_ranking_and_limits(self):
        listings = [
            {"title": NAME, "url": URL, "content": "EUR 1"},
            {"title": NAME, "url": URL + "?tracking=duplicate", "content": "EUR 2"},
            {"title": NAME + " used", "url": URL, "content": "EUR 90"},
            {"title": NAME + " refurbished", "url": URL, "content": "EUR 80"},
            {"title": NAME, "url": "https://amazon.it/dp/B0OTHER123", "content": "EUR 3"},
            {"title": NAME.replace("9700X", "9700X3D"), "url": "https://amazon.it/dp/B0WRONG123"},
        ]
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({"results": listings}).encode()
        with patch.object(search, "load_key", side_effect=lambda variable="TAVILY_API_KEY": "test" if variable == "TAVILY_API_KEY" else ""), patch.object(search.urllib.request, "urlopen", return_value=response), patch.object(search, "read_page", side_effect=lambda url: (url, page() if search.product_key(url) == search.product_key(URL) else "")) as read:
            result = search.search_offers(NAME, "CPU")
            self.assertEqual(len(result["offers"]), 4)
            self.assertEqual(result["offers"][0]["price"], 199.99)
            self.assertTrue(result["offers"][0]["verified"])
            self.assertEqual({o["condition"] for o in result["offers"]}, {"New", "Unknown", "Used", "Refurbished"})
            self.assertEqual(read.call_count, 2)
            with patch.object(search, "MAX_OFFERS", 2), patch.object(search, "MAX_CANDIDATES", 3):
                limited = search.search_offers(NAME, "CPU")
                self.assertEqual(len(limited["offers"]), 2)
                self.assertTrue(limited["offers"][0]["verified"])

    def test_redirect_cannot_verify_a_different_candidate(self):
        other = "https://amazon.it/dp/B0OTHER123"
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({"results": [{"title": NAME, "url": URL}, {"title": NAME, "url": other}]}).encode()
        with patch.object(search, "load_key", side_effect=lambda variable="TAVILY_API_KEY": "test" if variable == "TAVILY_API_KEY" else ""), patch.object(search.urllib.request, "urlopen", return_value=response), patch.object(search, "read_page", side_effect=[(other, page(url=other)), OSError("blocked")]):
            result = search.search_offers(NAME, "CPU")
        self.assertTrue(all(not o["verified"] and o["price"] is None for o in result["offers"]))
        request = search.urllib.request.Request(URL)
        with self.assertRaises(ValueError):
            search.RestrictedRedirect().redirect_request(request, None, 302, "redirect", {}, "https://outside.example/private")

    def test_refinement_failure_falls_back_and_quotes_stay_source_bound(self):
        candidates = [{"title": NAME, "url": URL, "content": "EUR 200"}]
        response = unittest.mock.MagicMock()
        selection = {"selected": [{"id": 0, "price_evidence": "EUR 1"}, {"id": 0}, {"id": 8}]}
        response.__enter__.return_value.read.return_value = json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(selection)}]}}]}).encode()
        with patch.object(search, "load_key", return_value="test"), patch.object(search.urllib.request, "urlopen", return_value=response) as call:
            refined = search.refine_candidates(NAME, candidates)
            self.assertEqual(refined, candidates)
            self.assertNotIn("tools", json.loads(call.call_args.args[0].data))
            call.side_effect = OSError("unavailable")
            self.assertEqual(search.refine_candidates(NAME, candidates), candidates)

    def test_search_fallback_merges_new_used_and_snippet_identity(self):
        def response(items):
            result = unittest.mock.MagicMock()
            result.__enter__.return_value.read.return_value = json.dumps({"results": items}).encode()
            return result
        first = {"title": NAME + " desktop processor", "url": URL}
        used = {"title": NAME + " usato", "url": "https://ebay.it/itm/123456789012"}
        generic = {"title": "AMD processor", "content": NAME + " EUR 150", "url": "https://amazon.it/dp/B0OTHER123"}
        wrong = {"title": "AMD Ryzen 7 9700X3D", "content": NAME, "url": "https://amazon.it/dp/B0WRONG123"}
        with patch.object(search, "load_key", return_value="test"), patch.object(search, "refine_candidates", side_effect=lambda name, items: [item for item in items if "9700X3D" not in item["title"]]), patch.object(search, "read_page", side_effect=OSError("blocked")), patch.object(search.urllib.request, "urlopen", side_effect=[response([first]), response([first, generic, wrong]), response([used])]) as call:
            result = search.search_offers(NAME, "CPU")
        self.assertEqual(len(result["offers"]), 3)
        self.assertIn("Used", {offer["condition"] for offer in result["offers"]})
        queries = [json.loads(entry.args[0].data)["query"] for entry in call.call_args_list]
        self.assertEqual(queries[0], '\"AMD Ryzen 7 9700X\" prezzo')
        self.assertIn("processore", queries[1])
        self.assertNotIn('"', queries[1])
        self.assertIn("usato", queries[2])
        self.assertTrue(all("9700X" in query for query in queries))

    def test_enough_results_skip_fallback_and_ram_query_keeps_variant(self):
        name = "Corsair DDR5 2x16GB 6000MHz CL36 RAM"
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({"results": [{"title": name, "url": f"https://amazon.it/dp/B0TEST123{i}"} for i in range(8)]}).encode()
        with patch.object(search, "load_key", return_value="test"), patch.object(search, "refine_candidates", side_effect=lambda name, items: items), patch.object(search, "read_page", side_effect=OSError("blocked")), patch.object(search.urllib.request, "urlopen", return_value=response) as call:
            result = search.search_offers(name, "RAM")
        self.assertEqual(len(result["offers"]), 8)
        call.assert_called_once()
        query = json.loads(call.call_args.args[0].data)["query"]
        for detail in ["DDR5", "2x16GB", "6000MHz", "CL36"]:
            self.assertIn(detail, query)

    def test_fallback_failure_keeps_first_results_but_initial_failure_propagates(self):
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({"results": [{"title": NAME, "url": URL}]}).encode()
        with patch.object(search, "load_key", return_value="test"), patch.object(search, "refine_candidates", side_effect=lambda name, items: items), patch.object(search, "read_page", side_effect=OSError("blocked")), patch.object(search.urllib.request, "urlopen", side_effect=[response, OSError("timeout")]) as call:
            self.assertEqual(len(search.search_offers(NAME, "CPU")["offers"]), 1)
            call.side_effect = OSError("initial failure")
            with self.assertRaises(OSError):
                search.search_offers(NAME, "CPU")

    def test_invalid_request_does_not_search(self):
        class Handler:
            headers = {"Content-Length": "2"}
            rfile = io.BytesIO(b"{}")
            def _json_response(self, status, body): self.status = status
        handler = Handler()
        with patch.object(search, "search_offers") as call:
            search.handle_offer_search(handler)
        self.assertEqual(handler.status, 400)
        call.assert_not_called()


if __name__ == "__main__":
    unittest.main()
