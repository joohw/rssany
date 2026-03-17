declare module 'lucide-svelte' {
  import type { Component } from 'svelte';
  export const Puzzle: Component<{ size?: number; class?: string }>;
}

declare module 'lucide-svelte/icons/puzzle' {
  import type { Component } from 'svelte';
  const Puzzle: Component<{ size?: number; class?: string }>;
  export default Puzzle;
}
