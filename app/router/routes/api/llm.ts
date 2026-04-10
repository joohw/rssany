// /api/llm — 读写 LLM 配置（config.json.llm）；GET 不返回完整 Key

import type { Hono } from "hono";
import { requireAdmin } from "../../../auth/middleware.js";
import { getLLMConfig } from "../../../core/llmConfig.js";
import { chatText } from "../../../core/llm.js";
import {readLlmFileConfig,saveLlmSettings} from "../../../config/llmSettings.js";


export function registerLlmRoutes(app: Hono): void {
  app.get("/api/llm", requireAdmin(), async (c) => {
    const resolved = getLLMConfig();
    const file = await readLlmFileConfig();
    const hasApiKey = !!resolved.apiKey;
    const apiKeyInFile = !!(file.apiKey && file.apiKey.length > 0);
    return c.json({
      baseUrl: resolved.baseUrl,
      model: resolved.model,
      hasApiKey,
      apiKeyInFile,
    });
  });

  
  app.put("/api/llm", requireAdmin(), async (c) => {
    try {
      const body = await c.req.json<{
        baseUrl?: unknown;
        model?: unknown;
        apiKey?: unknown;
      }>();
      const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";
      const model = typeof body.model === "string" ? body.model : "";
      const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
      await saveLlmSettings({
        baseUrl,
        model,
        ...(apiKey !== undefined ? { apiKey } : {}),
      });
      const resolved = getLLMConfig();
      const file = await readLlmFileConfig();
      return c.json({
        ok: true,
        baseUrl: resolved.baseUrl,
        model: resolved.model,
        hasApiKey: !!resolved.apiKey,
        apiKeyInFile: !!(file.apiKey && file.apiKey.length > 0),
      });
    } catch (err) {
      return c.json(
        { ok: false, message: err instanceof Error ? err.message : String(err) },
        400,
      );
    }
  });

  app.post("/api/llm/test", requireAdmin(), async (c) => {
    const t0 = Date.now();
    try {
      const cfg = getLLMConfig();
      if (!cfg.apiKey) {
        return c.json({ ok: false, message: "未配置 API Key（请在界面或 OPENAI_API_KEY 中设置）" }, 400);
      }
      const reply = await chatText("Reply with exactly the single word: ok", undefined, {
        maxTokens: 32768,
        debugLabel: "llmSettingsTest",
      });
      return c.json({ ok: true, reply });
    } catch (err) {
      const ms = Date.now() - t0;
      const message = err instanceof Error ? err.message : String(err);
      console.error("[llm/test] fail", { ms, message });
      return c.json({ ok: false, message }, 400);
    }
  });
}
