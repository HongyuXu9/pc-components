"""Protocol tests independent of Google credentials and installed SDK."""
import asyncio
from pathlib import Path
import sys
from types import SimpleNamespace as NS
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from partly_server.live_search import _receive_search


class Session:
    def __init__(self, messages):
        self.messages = messages
        self.replies = []

    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass
    async def send_client_content(self, **kwargs): self.request = kwargs
    async def send_tool_response(self, **kwargs): self.replies.append(kwargs)
    async def receive(self):
        for message in self.messages:
            yield message


def content(metadata=None, complete=False):
    grounding = NS(model_dump=lambda **kwargs: metadata) if metadata else None
    return NS(server_content=NS(grounding_metadata=grounding, turn_complete=complete), tool_call=None)


class LiveSearchTests(unittest.TestCase):
    def run_session(self, messages):
        self.session = Session(messages)
        def connect(**kwargs):
            self.config = kwargs
            return self.session
        return asyncio.run(_receive_search(NS(live=NS(connect=connect)), "Find exact offers"))

    def test_accumulates_grounding_before_and_after_tool_call(self):
        offers = [{"title": "CPU", "url": "https://www.amazon.it/dp/B0TEST1234"}]
        call = NS(server_content=None, tool_call=NS(function_calls=[NS(name="report_offers", id="1", args={"offers": offers})]))
        result, metadata = self.run_session([
            content({"groundingChunks": [{"web": {"uri": "https://example.com/1"}}]}),
            call,
            content({"groundingChunks": [{"web": {"uri": "https://example.com/2"}}], "searchEntryPoint": {"renderedContent": "suggestions"}}, True)])
        self.assertEqual(result, offers)
        self.assertEqual(len(metadata["groundingChunks"]), 2)
        self.assertEqual(metadata["searchEntryPoint"]["renderedContent"], "suggestions")
        self.assertEqual(self.config["model"], "gemini-3.8-live")
        self.assertIn({"google_search": {}}, self.config["config"]["tools"])
        self.assertTrue(self.session.request["turn_complete"])
        self.assertEqual(self.session.replies[0]["function_responses"][0]["id"], "1")

    def test_audio_without_report_is_not_an_empty_success(self):
        with self.assertRaisesRegex(ValueError, "no search results"):
            self.run_session([content(complete=True)])

    def test_invalid_report_is_rejected(self):
        call = NS(name="report_offers", id="1", args={"offers": "invalid"})
        with self.assertRaisesRegex(ValueError, "unreadable"):
            self.run_session([NS(server_content=None, tool_call=NS(function_calls=[call]))])
