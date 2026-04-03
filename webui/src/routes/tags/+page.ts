import { redirect } from '@sveltejs/kit';

/** 兼容旧路由 */
export function load() {
  throw redirect(302, '/');
}
