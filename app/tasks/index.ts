// 后端任务：提交后立即返回 taskId；状态既可查询，也可通过 SSE 订阅变更。

export interface TaskState {
  id: string;
  status: string;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const tasks = new Map<string, TaskState>();
const listeners = new Map<string, Set<(task: TaskState) => void>>();
let idCounter = 0;

function emitTask(id: string): void {
  const task = tasks.get(id);
  if (!task) return;
  for (const listener of listeners.get(id) ?? []) listener({ ...task });
}

function nextId(): string {
  idCounter += 1;
  return `t_${Date.now().toString(36)}_${idCounter}`;
}

export function createTask(): string {
  const id = nextId();
  const now = Date.now();
  tasks.set(id, { id, status: "pending", createdAt: now, updatedAt: now });
  return id;
}

export function getTask(id: string) {
  return tasks.get(id) ?? null;
}

export function setTaskRunning(id: string): void {
  const t = tasks.get(id);
  if (t) {
    t.status = "running";
    t.updatedAt = Date.now();
    emitTask(id);
  }
}

export function setTaskDone<T>(id: string, result: T): void {
  const t = tasks.get(id);
  if (t) {
    t.status = "done";
    t.result = result as unknown;
    t.updatedAt = Date.now();
    emitTask(id);
  }
}

export function setTaskError(id: string, error: string): void {
  const t = tasks.get(id);
  if (t) {
    t.status = "error";
    t.error = error;
    t.updatedAt = Date.now();
    emitTask(id);
  }
}

export function onTaskUpdated(id: string, listener: (task: TaskState) => void): () => void {
  const set = listeners.get(id) ?? new Set<(task: TaskState) => void>();
  set.add(listener);
  listeners.set(id, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(id);
  };
}

/** 清理 1 小时前的已完成/失败任务 */
export function pruneTasks(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, t] of tasks) {
    if ((t.status === "done" || t.status === "error") && t.updatedAt < cutoff) {
      tasks.delete(id);
      listeners.delete(id);
    }
  }
}
