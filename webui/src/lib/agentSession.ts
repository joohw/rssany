// 模块级 store：多会话聊天；按登录用户隔离持久化到 localStorage（rssany_chat_sessions:{userId}）

import { writable, get, derived } from 'svelte/store';

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
}

/** 推理链：文本与工具调用按发生顺序交错（工具在推理流内部） */
export type ReasoningSegment =
  | { type: 'text'; text: string }
  | ({ type: 'tool' } & ToolCall);

export interface TokenUsage {
  input?: number;
  output?: number;
  totalTokens: number;
  cost?: { total: number };
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 交错后的推理链；新消息优先使用 */
  reasoningChain?: ReasoningSegment[];
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
  streamReasoningChain: ReasoningSegment[];
  error: string;
  lastUsage?: TokenUsage;
}

const initialStreamState: AgentStreamState = {
  streaming: false,
  streamContent: '',
  streamReasoningChain: [],
  error: '',
  lastUsage: undefined,
};

/** 旧存档仅有 reasoning + toolCalls 时，还原为单条链（顺序：先全部推理再全部工具） */
export function normalizeReasoningChain(msg: AgentMessage): ReasoningSegment[] {
  if (msg.reasoningChain && msg.reasoningChain.length > 0) return msg.reasoningChain;
  const out: ReasoningSegment[] = [];
  if (msg.reasoning?.trim()) out.push({ type: 'text', text: msg.reasoning });
  for (const tc of msg.toolCalls ?? []) out.push({ type: 'tool', ...tc });
  return out;
}

function trimReasoningChain(chain: ReasoningSegment[]): ReasoningSegment[] {
  return chain
    .map((seg) => (seg.type === 'text' ? { ...seg, text: seg.text.trim() } : seg))
    .filter((seg) => (seg.type === 'text' ? seg.text.length > 0 : true));
}

/** 旧版全局 key（迁移到首个登录用户的分桶 key） */
const STORAGE_KEY_LEGACY = 'rssany_chat_sessions';
const LEGACY_KEY = 'MainSession';
const MAX_SESSIONS = 50;
const TITLE_MAX_LEN = 36;

function chatStorageKeyForUser(userId: string): string {
  return `${STORAGE_KEY_LEGACY}:${userId}`;
}

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

function emptyStoredState(): StoredState {
  const id = genId();
  const now = Date.now();
  return {
    currentId: id,
    sessions: { [id]: { id, title: '新对话', messages: [], createdAt: now, updatedAt: now } },
  };
}

/** 当前登录用户 id；null 表示未登录或未初始化，不落盘 */
let activeUserId: string | null = null;

/** 与 setAgentSessionUser 同步，供 UI 判断可否对话 */
export const agentSessionUserId = writable<string | null>(null);

/** 是否已完成至少一次与后端的会话用户同步（避免未就绪时误用旧全局缓存） */
export const agentSessionReady = writable(false);

let authSyncInFlight: Promise<void> | null = null;

/** 从 /api/auth/me 同步当前用户并加载该用户的会话存档；并发调用共享同一请求 */
export function syncAgentSessionFromApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!authSyncInFlight) {
    authSyncInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as { user?: { id?: string } };
          const id = data?.user?.id;
          setAgentSessionUser(typeof id === 'string' ? id : null);
        } else {
          setAgentSessionUser(null);
        }
      } catch {
        setAgentSessionUser(null);
      } finally {
        agentSessionReady.set(true);
      }
    })();
    void authSyncInFlight.finally(() => {
      authSyncInFlight = null;
    });
  }
  return authSyncInFlight;
}

function parseStoredState(raw: string): StoredState | null {
  try {
    const parsed = JSON.parse(raw) as StoredState;
    if (parsed?.currentId && parsed?.sessions && typeof parsed.sessions === 'object') return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 读取某用户的会话存档；支持从旧全局 key / MainSession 迁移到分桶 key。
 */
function loadFromStorageForUser(userId: string): StoredState {
  if (typeof localStorage === 'undefined') {
    return emptyStoredState();
  }
  try {
    const scoped = localStorage.getItem(chatStorageKeyForUser(userId));
    if (scoped) {
      const parsed = parseStoredState(scoped);
      if (parsed) return parsed;
    }
    const legacyFlat = localStorage.getItem(STORAGE_KEY_LEGACY);
    if (legacyFlat) {
      const parsed = parseStoredState(legacyFlat);
      if (parsed) {
        localStorage.removeItem(STORAGE_KEY_LEGACY);
        localStorage.setItem(chatStorageKeyForUser(userId), legacyFlat);
        return parsed;
      }
    }
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
    const state: StoredState = { currentId: id, sessions: { [id]: session } };
    localStorage.setItem(chatStorageKeyForUser(userId), JSON.stringify(state));
    return state;
  } catch {
    return emptyStoredState();
  }
}

function saveToStorage(state: StoredState, userId: string | null): void {
  if (typeof localStorage === 'undefined' || !userId) return;
  try {
    let nextState = state;
    const sessions = nextState.sessions;
    const ids = Object.keys(sessions);
    if (ids.length > MAX_SESSIONS) {
      const sorted = ids
        .map((id) => ({ id, updatedAt: sessions[id].updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const toRemove = sorted.slice(MAX_SESSIONS).map((s) => s.id);
      const next: Record<string, ChatSession> = {};
      for (const id of ids) if (!toRemove.includes(id)) next[id] = sessions[id];
      nextState = { ...nextState, sessions: next };
    }
    localStorage.setItem(chatStorageKeyForUser(userId), JSON.stringify(nextState));
  } catch {
    /* ignore */
  }
}

function flushPersistForUser(userId: string): void {
  saveToStorage({ currentId: get(_currentId), sessions: get(_sessions) }, userId);
}

const initialState = emptyStoredState();
const _currentId = writable<string>(initialState.currentId);
const _sessions = writable<Record<string, ChatSession>>(initialState.sessions);
const _messages = writable<AgentMessage[]>(initialState.sessions[initialState.currentId]?.messages ?? []);

function persistCurrentSession(messages: AgentMessage[]): void {
  if (!activeUserId) return;
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
  saveToStorage({ currentId: id, sessions: next }, activeUserId);
}

_messages.subscribe((msgs) => {
  const id = get(_currentId);
  const sessions = get(_sessions);
  if (!activeUserId || !sessions[id]) return;
  persistCurrentSession(msgs);
});

/**
 * 切换当前会话所属用户：切换前将旧用户状态落盘，再加载新用户存档。
 * 未登录时清空内存中的会话且不再写入 localStorage。
 */
export function setAgentSessionUser(userId: string | null): void {
  const prev = activeUserId;
  if (prev === userId) {
    agentSessionUserId.set(userId);
    return;
  }
  if (prev && prev !== userId) {
    flushPersistForUser(prev);
  }
  activeUserId = userId;
  agentSessionUserId.set(userId);

  if (!userId) {
    agentStream.resetStream();
    const id = genId();
    const now = Date.now();
    _currentId.set(id);
    _sessions.set({ [id]: { id, title: '新对话', messages: [], createdAt: now, updatedAt: now } });
    _messages.set([]);
    return;
  }

  const state = loadFromStorageForUser(userId);
  _currentId.set(state.currentId);
  _sessions.set(state.sessions);
  _messages.set(state.sessions[state.currentId]?.messages ?? []);
}

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

/** 从当前用户的 localStorage 重新加载（例如多标签页） */
export function rehydrateAgentMessages(): void {
  const uid = activeUserId;
  if (!uid || typeof localStorage === 'undefined') return;
  const state = loadFromStorageForUser(uid);
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
  },
};

/** 新建会话 */
export function createNewSession(): string {
  if (!activeUserId) return get(_currentId);
  agentStream.resetStream();
  const id = genId();
  const now = Date.now();
  const session: ChatSession = { id, title: '新对话', messages: [], createdAt: now, updatedAt: now };
  _currentId.set(id);
  _sessions.update((s) => ({ ...s, [id]: session }));
  _messages.set([]);
  const sessions = get(_sessions);
  saveToStorage({ currentId: id, sessions }, activeUserId);
  return id;
}

/** 切换到指定历史会话 */
export function loadSession(id: string): void {
  if (!activeUserId) return;
  const sessions = get(_sessions);
  const session = sessions[id];
  if (!session) return;
  agentStream.resetStream();
  _currentId.set(id);
  _messages.set(session.messages.length > 0 ? [...session.messages] : []);
}

/** 删除一条历史会话 */
export function deleteSession(id: string): void {
  if (!activeUserId) return;
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
    saveToStorage({ currentId: nextId, sessions }, activeUserId);
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
    saveToStorage({ currentId: newId, sessions }, activeUserId);
    return;
  }
  saveToStorage({ currentId: current, sessions }, activeUserId);
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
    _stream.update((s) => {
      const chain = [...s.streamReasoningChain];
      const last = chain[chain.length - 1];
      if (last?.type === 'text') {
        chain[chain.length - 1] = { type: 'text', text: last.text + delta };
      } else {
        chain.push({ type: 'text', text: delta });
      }
      return { ...s, streamReasoningChain: chain };
    });
  },

  appendToolCall(tc: ToolCall) {
    _stream.update((s) => ({
      ...s,
      streamReasoningChain: [...s.streamReasoningChain, { type: 'tool', ...tc }],
    }));
  },

  updateToolCallStatus(toolCallId: string, status: 'success' | 'error') {
    _stream.update((s) => ({
      ...s,
      streamReasoningChain: s.streamReasoningChain.map((seg) =>
        seg.type === 'tool' && seg.toolCallId === toolCallId ? { ...seg, status } : seg
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
    const chain = trimReasoningChain(s.streamReasoningChain);
    const hasContent = !!content || chain.length > 0;
    if (hasContent) {
      _messages.update((m) => [
        ...m,
        {
          role: 'assistant',
          content,
          reasoningChain: chain.length > 0 ? chain : undefined,
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
