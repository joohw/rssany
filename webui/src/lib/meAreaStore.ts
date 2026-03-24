import { get, writable } from 'svelte/store';
import { fetchJson } from '$lib/fetchJson.js';

export type MeUser = {
  email?: string;
  display_name?: string | null;
  provider?: string;
  /** 与后端 users.role 一致，如 admin */
  role?: string;
};

export type SystemReportRow = {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
};

type MeUserState = {
  user: MeUser | null;
  loading: boolean;
  loaded: boolean;
};

type DailyReportsState = {
  reports: SystemReportRow[];
  /** false 表示未建表 user_daily_subscriptions */
  subsDbReady: boolean;
  loading: boolean;
  loadError: string;
  loaded: boolean;
};

const initialUser: MeUserState = { user: null, loading: false, loaded: false };

const initialDaily: DailyReportsState = {
  reports: [],
  subsDbReady: true,
  loading: false,
  loadError: '',
  loaded: false,
};

/** /me 子树内共享：资料与日报订阅，避免子页面间反复请求 */
export const meUser = writable<MeUserState>(initialUser);

export const meDailyReports = writable<DailyReportsState>(initialDaily);

export function resetMeStores() {
  meUser.set(initialUser);
  meDailyReports.set(initialDaily);
}

export function setMeUserFromAuthBody(data: { user?: MeUser }) {
  meUser.set({
    user: data.user ?? null,
    loading: false,
    loaded: true,
  });
}

/**
 * 已加载则跳过（除非 force）。供 /me 首页与组件 onMount 调用，幂等。
 */
export async function loadDailyReports(force = false) {
  const cur = get(meDailyReports);
  if (cur.loaded && !force) return;

  meDailyReports.update((s) => ({ ...s, loading: true, loadError: '' }));
  try {
    const sysRes = await fetchJson<{ reports?: SystemReportRow[]; dbReady?: boolean }>('/api/daily-reports', {
      credentials: 'include',
    });
    meDailyReports.set({
      reports: sysRes?.reports ?? [],
      subsDbReady: sysRes?.dbReady !== false,
      loading: false,
      loadError: '',
      loaded: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    meDailyReports.set({
      reports: [],
      subsDbReady: true,
      loading: false,
      loadError: msg,
      loaded: true,
    });
  }
}

export function patchDailyReportEnabled(key: string, enabled: boolean) {
  meDailyReports.update((s) => ({
    ...s,
    reports: s.reports.map((r) => (r.key === key ? { ...r, enabled } : r)),
  }));
}
