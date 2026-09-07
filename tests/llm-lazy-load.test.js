import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadSdk: vi.fn(),
  create: vi.fn(),
  config: vi.fn(),
}));

vi.mock("../app/core/llmConfig.js", () => ({ getLLMConfig: mocks.config }));
vi.mock("openai", () => {
  mocks.loadSdk();
  return {
    default: class OpenAI {
      chat = { completions: { create: mocks.create } };
    },
  };
});

describe("LLM dependency loading", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.config.mockReturnValue({ apiKey: "", baseUrl: "http://unused.invalid/v1", model: "test" });
  });

  it("does not load the SDK when importing helpers or rejecting missing configuration", async () => {
    const { chatText } = await import("../app/core/llm.ts");
    expect(mocks.loadSdk).not.toHaveBeenCalled();
    await expect(chatText("test")).rejects.toThrow("LLM API Key 未配置");
    expect(mocks.loadSdk).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("loads on the first request and preserves JSON and text responses", async () => {
    const { chatJson, chatText } = await import("../app/core/llm.ts");
    mocks.config.mockReturnValue({ apiKey: "fixture-key", baseUrl: "http://unused.invalid/v1", model: "test" });
    mocks.create
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: " result " }, finish_reason: "stop" }] });

    await expect(chatJson("JSON prompt")).resolves.toEqual({ ok: true });
    await expect(chatText("text prompt")).resolves.toBe("result");
    expect(mocks.loadSdk).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ response_format: { type: "json_object" } }));
    expect(mocks.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ messages: [{ role: "user", content: "text prompt" }] }));
  });
});
