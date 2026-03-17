// 模块级 store：切换页面时保留聊天状态，避免组件卸载导致丢失

import { writable, get } from 'svelte/store';

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
}

export interface TokenUsage {
  input?: number;
  output?: number;
  totalTokens: number;
  cost?: { total: number };
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 思考过程（thinking），可展开/收起 */
  reasoning?: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
}

export interface AgentStreamState {
  streaming: boolean;
  streamContent: string;
  /** 推理/思考内容（thinking_delta），与正文 streamContent 区分 */
  streamReasoning: string;
  streamToolCalls: ToolCall[];
  error: string;
  lastUsage?: TokenUsage;
}

const initialStreamState: AgentStreamState = {
  streaming: false,
  streamContent: '',
  streamReasoning: '',
  streamToolCalls: [],
  error: '',
  lastUsage: undefined,
};

const STORAGE_KEY = 'MainSession';

function loadFromStorage(): AgentMessage[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) return [];
    const parsed = JSON.parse(cached) as AgentMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(messages: AgentMessage[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

// 模块级 store，切换路由时保留
const _messages = writable<AgentMessage[]>(loadFromStorage());

_messages.subscribe((msgs) => {
  saveToStorage(msgs);
});

/** 从 localStorage 重新加载（页面挂载时调用，防止 store 被重置） */
export function rehydrateAgentMessages(): void {
  if (typeof localStorage === 'undefined') return;
  const stored = loadFromStorage();
  if (stored.length > 0 && get(_messages).length === 0) {
    _messages.set(stored);
  }
}

export const agentMessages = {
  subscribe: _messages.subscribe,
  set: _messages.set,
  update: _messages.update,
  get: () => get(_messages),
  clear: () => {
    _messages.set([]);
    saveToStorage([]);
  },
};

// 流式输出状态：放在 store 里，切换页面后回来仍能看到进行中的流或已完成结果
const _stream = writable<AgentStreamState>({ ...initialStreamState });

export const agentStream = {
  subscribe: _stream.subscribe,
  get: () => get(_stream),

  startStream() {
    _stream.set({ ...initialStreamState, streaming: true });
  },

  appendContent(delta: string) {
    _stream.update((s) => ({ ...s, streamContent: s.streamContent + delta }));
  },

  appendReasoning(delta: string) {
    _stream.update((s) => ({ ...s, streamReasoning: s.streamReasoning + delta }));
  },

  setToolCalls(toolCalls: ToolCall[]) {
    _stream.update((s) => ({ ...s, streamToolCalls: toolCalls }));
  },

  updateToolCallStatus(toolCallId: string, status: 'success' | 'error') {
    _stream.update((s) => ({
      ...s,
      streamToolCalls: s.streamToolCalls.map((t) =>
        t.toolCallId === toolCallId ? { ...t, status } : t
      ),
    }));
  },

  setError(message: string) {
    _stream.update((s) => ({ ...s, error: message }));
  },

  setUsage(usage: TokenUsage) {
    _stream.update((s) => ({ ...s, lastUsage: usage }));
  },

  /** 流结束：写入一条 assistant 消息并清空流状态（含 reasoning 供结束后展开查看） */
  finishStream() {
    const s = get(_stream);
    const content = s.error || s.streamContent || '(无回复)';
    const hasContent = !!content || s.streamToolCalls.length > 0;
    if (hasContent) {
      _messages.update((m) => [
        ...m,
        {
          role: 'assistant',
          content,
          reasoning: s.streamReasoning.trim() || undefined,
          toolCalls: s.streamToolCalls.length > 0 ? s.streamToolCalls : undefined,
          usage: s.lastUsage,
        },
      ]);
    }
    _stream.set({ ...initialStreamState });
  },

  resetStream() {
    _stream.set({ ...initialStreamState });
  },
};
