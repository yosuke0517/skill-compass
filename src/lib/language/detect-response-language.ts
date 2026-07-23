const japaneseScript = /[\u3040-\u30ff\u3400-\u9fff]/u;

export function detectResponseLanguage(text: string): "ja" | "en" {
  return japaneseScript.test(text) ? "ja" : "en";
}
