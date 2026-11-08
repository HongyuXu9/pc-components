"""One bounded Live session per explicit offer search. No microphone is used."""
import asyncio

from .config import OFFER_SEARCH_MODEL
from .logging_config import logger


REPORT_TOOL = {
    "name": "report_offers",
    "description": "Submit the final exact product listings found using Google Search, or an empty list.",
    "parameters": {
        "type": "OBJECT", "properties": {"offers": {
            "type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "title": {"type": "STRING"}, "url": {"type": "STRING"}},
                "required": ["title", "url"]}}}, "required": ["offers"]},
}


async def _receive_search(client, prompt):
    config = {"response_modalities": ["AUDIO"], "tools": [
        {"google_search": {}}, {"function_declarations": [REPORT_TOOL]}],
        "system_instruction": "Use Google Search before calling report_offers. Submit results once using report_offers. Do not read URLs aloud."}
    metadata = {"groundingChunks": []}
    proposed = None
    async with client.live.connect(model=OFFER_SEARCH_MODEL, config=config) as session:
        await session.send_client_content(
            turns={"role": "user", "parts": [{"text": prompt}]}, turn_complete=True)
        async for message in session.receive():
            content = message.server_content
            if content and content.grounding_metadata:
                grounding = content.grounding_metadata.model_dump(by_alias=True, exclude_none=True)
                metadata["groundingChunks"].extend(grounding.get("groundingChunks", []))
                if grounding.get("searchEntryPoint"):
                    metadata["searchEntryPoint"] = grounding["searchEntryPoint"]
            if message.tool_call:
                replies = []
                for call in message.tool_call.function_calls or []:
                    if call.name != "report_offers" or proposed is not None:
                        raise ValueError("Gemini returned an unexpected search tool call. No offers were added.")
                    proposed = (call.args or {}).get("offers")
                    if not isinstance(proposed, list) or len(proposed) > 6:
                        raise ValueError("Gemini returned an unreadable search response. No offers were added.")
                    if any(not isinstance(item, dict) or not isinstance(item.get("title"), str)
                           or not isinstance(item.get("url"), str) or len(item["url"]) > 4096
                           for item in proposed):
                        raise ValueError("Gemini returned an unreadable search response. No offers were added.")
                    replies.append({"id": call.id, "name": call.name, "response": {"received": True}})
                await session.send_tool_response(function_responses=replies)
            if content and content.turn_complete:
                break
    if proposed is None:
        raise ValueError("Gemini returned no search results. Check partly.log and API access.")
    return proposed, metadata


def discover_offers(key, prompt):
    try:
        from google import genai
    except ImportError:
        raise ValueError("Offer search requires Google GenAI. Install requirements.txt and restart Partly.") from None

    async def run():
        async with genai.Client(api_key=key, http_options={"api_version": "v1beta"}).aio as client:
            return await asyncio.wait_for(_receive_search(client, prompt), timeout=60)

    try:
        return asyncio.run(run())
    except TimeoutError:
        raise ValueError("Gemini Live search timed out. Retry later; no offers were added.") from None
    except ValueError:
        raise
    except Exception as error:
        # SDK/WebSocket errors may include credentials in connection URLs.
        code = getattr(getattr(error, "response", None), "status_code", None) or getattr(error, "code", None)
        logger.warning("Gemini Live search failed: type=%s, code=%s", type(error).__name__, code if isinstance(code, int) else "unknown")
        if code == 429 or "quota" in str(error).lower() or "resource_exhausted" in str(error).lower():
            raise ValueError("Gemini Live quota unavailable or exceeded. Check API quota and billing in Google AI Studio; screenshot OCR may still work.") from None
        raise ValueError("Gemini Live search unavailable. Check model access, Google Search quota and API permissions in Google AI Studio.") from None
