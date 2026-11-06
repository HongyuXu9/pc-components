import { extractProducts, guessCategory } from "./domain.js";

const $ = (id) => document.getElementById(id);

export function createImageRecognition({
  isAiEnabled,
  onResults,
  reportClientIssue,
}) {
  async function extractScreenshotWithGemini(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Could not read screenshot"));
      reader.readAsDataURL(file);
    });
    const response = await fetch("/api/extract-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType: file.type, data: dataUrl }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Gemini request failed (${response.status})`);
    const items = Array.isArray(result.items) ? result.items : [];
    return {
      store: String(result.store || ""),
      items: items
        .filter((item) => item && String(item.name || "").trim())
        .map((item) => ({
          name: String(item.name).trim().slice(0, 140),
          price: String(item.price ?? "").trim(),
          category: ["CPU", "GPU", "RAM", "Motherboard", "Storage", "Power supply", "Case", "Cooling", "Monitor", "Accessories", "Other"].includes(item.category)
            ? item.category
            : guessCategory(String(item.name)),
        })),
    };
  }

  async function recognizeScreenshot(file) {
    if (!file) return;
    showScreenshotPreview(file);
    $("ocrStatus").textContent = "Reading screenshot and looking for products…";
    let localMethod = "Local OCR";
    try {
      if (isAiEnabled()) {
        $("ocrStatus").textContent = "Sending screenshot to Gemini for product recognition…";
        try {
          const aiResult = await extractScreenshotWithGemini(file);
          if (aiResult.items.length) {
            onResults(aiResult.items, aiResult.store, "Gemini AI");
            return;
          }
          throw new Error("Gemini did not find any products");
        } catch (error) {
          localMethod = "Local OCR · Gemini unavailable; check its API key or connection";
          reportClientIssue("warning", error?.message || error, "Gemini image extraction; using local OCR");
        }
      }
      if (!window.Tesseract) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src =
            "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.append(script);
        });
      }
      const result = await window.Tesseract.recognize(file, "eng");
      const lines =
        result.data.lines ||
        (result.data.text || "").split(/\n/).map((text) => ({ text }));
      const items = extractProducts(lines);
      if (!items.length) {
        $("ocrStatus").textContent =
          "No products detected. Try a clearer screenshot or enter one manually.";
        return;
      }
      const allText = result.data.text || "";
      const stores = [
        "Amazon",
        "MediaMarkt",
        "PcComponentes",
        "AliExpress",
        "eBay",
        "Newegg",
        "Best Buy",
      ];
      const detectedStore =
        stores.find((store) =>
          allText.toLowerCase().includes(store.toLowerCase()),
        ) || "";
      onResults(items, detectedStore, localMethod);
    } catch (error) {
      $("ocrStatus").textContent =
        "Screenshot reading failed. Check your connection, or enter the products manually.";
      console.error(error);
    }
  }

  let screenshotPreviewUrl = "";
  function clearScreenshotPreview() {
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
    screenshotPreviewUrl = "";
    $("screenshotPreview").hidden = true;
    $("screenshotPreviewImage").removeAttribute("src");
    $("screenshotPreviewName").textContent = "";
  }
  function showScreenshotPreview(file) {
    clearScreenshotPreview();
    screenshotPreviewUrl = URL.createObjectURL(file);
    const preview = $("screenshotPreviewImage");
    preview.src = screenshotPreviewUrl;
    $("screenshotPreviewName").textContent = `${file.name || "Pasted image"} · ${(file.size / 1024).toFixed(0)} KB`;
    $("screenshotPreview").hidden = false;
  }

  return { recognizeScreenshot, clearScreenshotPreview };
}
