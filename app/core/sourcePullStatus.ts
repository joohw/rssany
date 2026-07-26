import { canonicalHttpSourceRef } from "../utils/httpSourceRef.js";

export type SourcePullPhase = "idle" | "pending" | "running" | "done" | "error";

export interface SourcePullStatus {
  ref: string;
  status: SourcePullPhase;
  pending: number;
  running: number;
  startedAt?: number;
  updatedAt: number;
  error?: string;
}

const active = new Map<string, SourcePullStatus>();
const listeners = new Set<(status: SourcePullStatus) => void>();

function keyFor(ref: string): string {
  return canonicalHttpSourceRef(ref.trim());
}

function publish(status: SourcePullStatus): void {
  for (const listener of listeners) listener({ ...status });
}

export function markSourcePullPending(ref: string): void {
  const key = keyFor(ref);
  const previous = active.get(key);
  const now = Date.now();
  const status: SourcePullStatus = {
    ref: key,
    status: previous?.running ? "running" : "pending",
    pending: (previous?.pending ?? 0) + 1,
    running: previous?.running ?? 0,
    startedAt: previous?.startedAt,
    updatedAt: now,
  };
  active.set(key, status);
  publish(status);
}

export function beginSourcePull(ref: string): void {
  const key = keyFor(ref);
  const previous = active.get(key);
  const now = Date.now();
  const status: SourcePullStatus = {
    ref: key,
    status: "running",
    pending: Math.max(0, (previous?.pending ?? 0) - 1),
    running: (previous?.running ?? 0) + 1,
    startedAt: previous?.startedAt ?? now,
    updatedAt: now,
  };
  active.set(key, status);
  publish(status);
}

export function finishSourcePull(ref: string, error?: string): void {
  const key = keyFor(ref);
  const previous = active.get(key);
  const pending = previous?.pending ?? 0;
  const running = Math.max(0, (previous?.running ?? 1) - 1);
  const now = Date.now();
  if (pending || running) {
    const status: SourcePullStatus = {
      ref: key,
      status: running ? "running" : "pending",
      pending,
      running,
      startedAt: previous?.startedAt,
      updatedAt: now,
      ...(error ? { error } : {}),
    };
    active.set(key, status);
    publish(status);
    return;
  }
  active.delete(key);
  publish({
    ref: key,
    status: error ? "error" : "done",
    pending: 0,
    running: 0,
    startedAt: previous?.startedAt,
    updatedAt: now,
    ...(error ? { error } : {}),
  });
}

export function getActiveSourcePullStatuses(): SourcePullStatus[] {
  return [...active.values()].map((status) => ({ ...status }));
}

export function getSourcePullStatus(ref: string): SourcePullStatus | null {
  const status = active.get(keyFor(ref));
  return status ? { ...status } : null;
}

export function onSourcePullStatus(listener: (status: SourcePullStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
