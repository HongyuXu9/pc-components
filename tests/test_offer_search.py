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
    def test_eligibility(self):
        self.assertTrue(search.eligibility("Corsair RAM", "RAM"))
        self.assertTrue(search.eligibility("Corsair Vengeance DDR5 32GB", "RAM"))
        self.assertTrue(search.eligibility("Corsair Vengeance DDR5 32GB 6000MHz CL36", "RAM"))
        self.assertFalse(search.eligibility("Corsair Vengeance DDR5 2x16GB 6000MHz CL36", "RAM"))
        self.assertTrue(search.eligibility("Samsung monitor 27", "Monitor"))
        self.assertFalse(search.eligibility(NAME, "CPU"))

    def test_urls_and_redirect_boundaries(self):
        self.assertEqual(search.product_key(URL), ("Amazon", "B0TEST1234"))
        for url in ["https://amazon.it.evil.example/dp/B0TEST1234", "http://amazon.it/dp/B0TEST1234", "https://user@amazon.it/dp/B0TEST1234", "https://amazon.it:8080/dp/B0TEST1234", "https://127.0.0.1/private", "https://vertexaisearch.cloud.google.com/other"]:
            self.assertFalse(search.allowed_fetch(url))
        self.assertTrue(search.allowed_fetch("https://vertexaisearch.cloud.google.com/grounding-api-redirect/example"))
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

    def test_grounded_results_only_auto_verify(self):
        response = {"candidates": [{"content": {"parts": [{"text": json.dumps({"offers": [{"title": NAME, "url": URL}]})}]}, "groundingMetadata": {"groundingChunks": [{"web": {"uri": URL, "title": NAME}}]}}]}
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): return json.dumps(response).encode()
        with patch.object(search, "load_key", return_value="test-secret"), patch.object(search.urllib.request, "urlopen", return_value=Response()), patch.object(search, "read_page", return_value=(URL, page())):
            result = search.search_offers(NAME, "CPU")
            self.assertTrue(result["offers"][0]["verified"])
            self.assertEqual(result["offers"][0]["price"], 199.99)
            response["candidates"][0]["groundingMetadata"] = {}
            result = search.search_offers(NAME, "CPU")
            self.assertFalse(result["offers"][0]["verified"])
            self.assertIsNone(result["offers"][0]["price"])

    def test_invalid_request_does_not_call_gemini(self):
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
