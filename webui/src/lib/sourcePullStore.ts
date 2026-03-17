import { writable } from 'svelte/store';

/** 正在拉取的信源 ref -> taskId，用于全局显示拉取中状态与轮询 */
export const refToTaskId = writable<Record<string, string>>({});

export function setPulling(ref: string, taskId: string): void {
  refToTaskId.update((m) => ({ ...m, [ref]: taskId }));
}

export function clearPulling(ref: string): void {
  refToTaskId.update((m) => {
    const next = { ...m };
    delete next[ref];
    return next;
  });
}
