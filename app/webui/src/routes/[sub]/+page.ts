import { redirect } from '@sveltejs/kit';

export function load({ params }) {
  void params.sub;
  throw redirect(302, '/');
}
