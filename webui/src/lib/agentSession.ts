// 模块级 store：多会话聊天，当前会话 + 历史会话持久化到 localStorage

import { writable, get, derived } from 'svelte/store';

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
  reasoning?: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface AgentStreamState {
  streaming: boolean;
  streamContent: string;
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

const STORAGE_KEY = 'rssany_chat_sessions';
const LEGACY_KEY = 'MainSession';
const MAX_SESSIONS = 50;
const TITLE_MAX_LEN = 36;

function genId(): string {
  return crypto.randomUUID?.() ?? `s${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function deriveTitle(messages: AgentMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser?.content) return '新对话';
  const text = firstUser.content.trim().replace(/\s+/g, ' ');
  return text.length <= TITLE_MAX_LEN ? text : text.slice(0, TITLE_MAX_LEN) + '…';
}

interface StoredState {
  currentId: string;
  sessions: Record<string, ChatSession>;
}

function loadFromStorage(): StoredState {
  if (typeof localStorage === 'undefined') {
    const id = genId();
    return { currentId: id, sessions: { [id]: { id, title: '新对话', messages: [], createdAt: Date.now(), updatedAt: Date.now() } } };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredState;
      if (parsed?.currentId && parsed?.sessions && typeof parsed.sessions === 'object') return parsed;
    }
    // 迁移旧版 MainSession
    const legacy = localStorage.getItem(LEGACY_KEY);
    let messages: AgentMessage[] = [];
    if (legacy) {
      try {
        const arr = JSON.parse(legacy) as AgentMessage[];
        if (Array.isArray(arr)) messages = arr;
      } catch {
        /* ignore */
      }
      localStorage.removeItem(LEGACY_KEY);
    }
    const id = genId();
    const now = Date.now();
    const session: ChatSession = {
      id,
      title: messages.length > 0 ? deriveTitle(messages) : '新对话',
      messages,
      createdAt: now,
      updatedAt: now,
    };
    return { currentId: id, sessions: { [id]: session } };
  } catch {
    const id = genId();
    return { currentId: id, sessions: { [id]: { id, title: '新对话', messages: [], createdAt: Date.now(), updatedAt: Date.now() } } };
  }
}

function saveToStorage(state: StoredState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const sessions = state.sessions;
    const ids = Object.keys(sessions);
    if (ids.length > MAX_SESSIONS) {
      const sorted = ids
        .map((id) => ({ id, updatedAt: sessions[id].updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const toRemove = sorted.slice(MAX_SESSIONS).map((s) => s.id);
      const next: Record<string, ChatSession> = {};
      for (const id of ids) if (!toRemove.includes(id)) next[id] = sessions[id];
      state = { ...state, sessions: next };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

const initialState = loadFromStorage();
const _currentId = writable<string>(initialState.currentId);
const _sessions = writable<Record<string, ChatSession>>(initialState.sessions);
const _messages = writable<AgentMessage[]>(initialState.sessions[initialState.currentId]?.messages ?? []);

function persistCurrentSession(messages: AgentMessage[]): void {
  const id = get(_currentId);
  const sessions = get(_sessions);
  const session = sessions[id];
  const now = Date.now();
  const title = messages.length > 0 ? deriveTitle(messages) : '新对话';
  if (session) {
    _sessions.update((s) => ({
      ...s,
      [id]: { ...session, messages, title, updatedAt: now },
    }));
  } else {
    _sessions.update((s) => ({
      ...s,
      [id]: { id, title, messages, createdAt: now, updatedAt: now },
    }));
  }
  const next = get(_sessions);
  saveToStorage({ currentId: id, sessions: next });
}

_messages.subscribe((msgs) => {
  const id = get(_currentId);
  const sessions = get(_sessions);
  if (!sessions[id]) return;
  persistCurrentSession(msgs);
});

export const currentSessionId = {
  subscribe: _currentId.subscribe,
  get: () => get(_currentId),
};

/** 历史会话列表，按更新时间倒序（响应式） */
export const sessionList = derived(_sessions, (s) =>
  Object.values(s).sort((a, b) => b.updatedAt - a.updatedAt)
);

/** 当前会话（用于显示标题等） */
export const currentSession = derived(
  [_currentId, _sessions],
  ([id, s]) => (id ? s[id] ?? null : null)
);

export function rehydrateAgentMessages(): void {
  if (typeof localStorage === 'undefined') return;
  const state = loadFromStorage();
  _currentId.set(state.currentId);
  _sessions.set(state.sessions);
  _messages.set(state.sessions[state.currentId]?.messages ?? []);
}

export const agentMessages = {
  subscribe: _messages.subscribe,
  set: _messages.set,
  update: _messages.update,
  get: () => get(_messages),
  clear: () => {
    _messages.set([]);
    persistCurrentSession([]);
  },
};

/** 新建会话 */
export function createNewSession(): string {
  agentStream.resetStream();
  const id = genId();
  const now = Date.now();
  const session: ChatSession = { id, title: '新对话', messages: [], createdAt: now, updatedAt: now };
  _currentId.set(id);
  _sessions.update((s) => ({ ...s, [id]: session }));
  _messages.set([]);
  const sessions = get(_sessions);
  saveToStorage({ currentId: id, sessions });
  return id;
}

/** 切换到指定历史会话 */
export function loadSession(id: string): void {
  const sessions = get(_sessions);
  const session = sessions[id];
  if (!session) return;
  agentStream.resetStream();
  _currentId.set(id);
  _messages.set(session.messages.length > 0 ? [...session.messages] : []);
}

/** 删除一条历史会话 */
export function deleteSession(id: string): void {
  const current = get(_currentId);
  _sessions.update((s) => {
    const next = { ...s };
    delete next[id];
    return next;
  });
  let sessions = get(_sessions);
  if (current === id && Object.keys(sessions).length > 0) {
    const nextId = Object.keys(sessions)[0];
    _currentId.set(nextId);
    _messages.set(sessions[nextId].messages ?? []);
    saveToStorage({ currentId: nextId, sessions });
    return;
  }
  if (Object.keys(sessions).length === 0) {
    const newId = genId();
    const now = Date.now();
    const session: ChatSession = { id: newId, title: '新对话', messages: [], createdAt: now, updatedAt: now };
    sessions = { [newId]: session };
    _currentId.set(newId);
    _sessions.set(sessions);
    _messages.set([]);
    saveToStorage({ currentId: newId, sessions });
    return;
  }
  saveToStorage({ currentId: current, sessions });
}

// 流式输出状态
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
