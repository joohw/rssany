<script lang="ts">
	import { Switch as SwitchPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		checked = $bindable(false),
		size = "default",
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & {
		size?: "sm" | "default";
	} = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	data-size={size}
	class={cn(
		"rssany-switch focus-visible:border-ring focus-visible:ring-ring/35 aria-invalid:ring-destructive/20 aria-invalid:border-destructive shrink-0 rounded-full border border-transparent focus-visible:ring-3 aria-invalid:ring-3 peer group/switch relative inline-flex items-center shadow-inner transition-colors duration-150 outline-none after:absolute after:-inset-x-2 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class="rssany-switch-thumb pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform duration-150"
	/>
</SwitchPrimitive.Root>

<style>
	:global(.rssany-switch) {
		width: 44px;
		height: 24px;
		padding: 2px !important;
		background: var(--input);
	}

	:global(.rssany-switch[data-size="sm"]) {
		width: 36px;
		height: 20px;
	}

	:global(.rssany-switch[data-state="checked"]) {
		background: var(--primary);
	}

	:global(.rssany-switch-thumb) {
		width: 20px;
		height: 20px;
		transform: translateX(0);
	}

	:global(.rssany-switch[data-size="sm"] .rssany-switch-thumb) {
		width: 16px;
		height: 16px;
	}

	:global(.rssany-switch[data-state="checked"] .rssany-switch-thumb) {
		transform: translateX(20px);
	}

	:global(.rssany-switch[data-size="sm"][data-state="checked"] .rssany-switch-thumb) {
		transform: translateX(16px);
	}

	:global([dir="rtl"] .rssany-switch[data-state="checked"] .rssany-switch-thumb) {
		transform: translateX(-20px);
	}

	:global([dir="rtl"] .rssany-switch[data-size="sm"][data-state="checked"] .rssany-switch-thumb) {
		transform: translateX(-16px);
	}
</style>
