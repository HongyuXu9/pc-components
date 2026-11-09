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
