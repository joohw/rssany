<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import Coffee from 'lucide-svelte/icons/coffee';
  import { siGithub } from 'simple-icons';
  import { PRODUCT_NAME } from '$lib/brand';

  type Step = 'email' | 'code';

  let step: Step = 'email';
  let email = '';
  let code = '';
  let loading = false;
  let error = '';
  let toast = '';
  let resendCooldown = 0;
  let cooldownTimer: ReturnType<typeof setInterval> | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  $: nextUrl = $page.url.searchParams.get('next') ?? '/feeds?channel=all';

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        await goto(nextUrl, { replaceState: true });
        return;
      }
    } catch {
      /* stay */
    }

    const authParam = $page.url.searchParams.get('auth');
    if (authParam === 'error') {
      const msg = $page.url.searchParams.get('msg') ?? '登录失败';
      error = decodeURIComponent(msg);
    }
  });

  onDestroy(() => {
    if (cooldownTimer) clearInterval(cooldownTimer);
    if (toastTimer) clearTimeout(toastTimer);
  });

  function showToast(message: string, duration = 2200) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = '';
      toastTimer = null;
    }, duration);
  }

  function startCooldown(seconds = 60) {
    resendCooldown = seconds;
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      resendCooldown -= 1;
      if (resendCooldown <= 0) {
        resendCooldown = 0;
        if (cooldownTimer) clearInterval(cooldownTimer);
      }
    }, 1000);
  }

  async function sendCode() {
    error = '';
    if (!email || !email.includes('@')) {
      error = '请输入有效的邮箱地址';
      return;
    }
    loading = true;
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        error = data.error ?? '发送失败';
        return;
      }
      step = 'code';
      startCooldown(60);
    } catch {
      showToast('网络错误，请重试');
    } finally {
      loading = false;
    }
  }

  async function resendCode() {
    if (resendCooldown > 0) return;
    error = '';
    loading = true;
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        error = data.error ?? '发送失败';
        return;
      }
      startCooldown(60);
    } catch {
      showToast('网络错误，请重试');
    } finally {
      loading = false;
    }
  }

  async function verifyCode() {
    error = '';
    if (!code || code.length < 6) {
      error = '请输入 6 位验证码';
      return;
    }
    loading = true;
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        error = data.error ?? '验证失败';
        return;
      }
      await goto(nextUrl, { replaceState: true });
    } catch {
      showToast('网络错误，请重试');
    } finally {
      loading = false;
    }
  }

  function handleEmailKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') sendCode();
  }

  function handleCodeKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') verifyCode();
  }

  function handleCodeInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v = el.value.replace(/\D/g, '').slice(0, 6);
    code = v;
    el.value = v;
  }
</script>

<svelte:head>
  <title>{PRODUCT_NAME}</title>
  <meta
    name="description"
    content="{PRODUCT_NAME}：五分钟消除信息差。产品、论文、人物，你关心的 AI 资讯一网打尽；建议搭配浓缩咖啡。邮箱登录即可使用 Feeds、Agent 与订阅管理。"
  />
</svelte:head>

<div class="landing">
  <div class="landing-bg" aria-hidden="true">
    <div class="landing-bg-base"></div>
    <div class="landing-bg-mesh"></div>
    <div class="landing-bg-blob landing-bg-blob--1"></div>
    <div class="landing-bg-blob landing-bg-blob--2"></div>
    <div class="landing-bg-blob landing-bg-blob--3"></div>
    <div class="landing-bg-shimmer"></div>
    <div class="landing-bg-vignette"></div>
  </div>
  {#if toast}
    <div class="toast" role="status" aria-live="polite">{toast}</div>
  {/if}
  <header class="top">
    <div class="top-row">
      <div class="logo" aria-label={PRODUCT_NAME}>
        <span class="logo-icon" aria-hidden="true">
          <Coffee size={16} />
        </span>
        <span>{PRODUCT_NAME}</span>
      </div>
      <span class="github-mark" aria-hidden="true">
        <svg class="github-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path fill="currentColor" d={siGithub.path} />
        </svg>
      </span>
    </div>
  </header>

  <main class="main">
    {#if step === 'email'}
      <h1 class="title">每天五分钟，跟上 AI 前沿</h1>
      <p class="desc">产品、论文、人物，你关心的 AI 资讯，我们帮你一网打尽</p>

      {#if error}
        <div class="alert" role="alert">{error}</div>
      {/if}

      <div class="email-bar">
        <input
          id="landing-email"
          type="email"
          class="email-input"
          bind:value={email}
          on:keydown={handleEmailKeydown}
          placeholder="你的常用邮箱…"
          autocomplete="email"
          disabled={loading}
        />
        <button type="button" class="cta" disabled={loading || !email} on:click={sendCode}>
          {loading ? '发送中…' : '获取验证码'}
        </button>
      </div>

      <a class="browse" href="/feeds?channel=all">先浏览信息流 →</a>
    {:else}
      <h1 class="title title-sm">输入验证码</h1>
      <p class="desc">验证码已发送至 <strong>{email}</strong></p>

      {#if error}
        <div class="alert" role="alert">{error}</div>
      {/if}

      <div class="code-wrap">
        <input
          id="landing-code"
          type="text"
          inputmode="numeric"
          class="code-input"
          bind:value={code}
          on:input={handleCodeInput}
          on:keydown={handleCodeKeydown}
          placeholder="000000"
          autocomplete="one-time-code"
          maxlength="6"
          disabled={loading}
        />
      </div>

      <button type="button" class="cta cta-block" disabled={loading || code.length < 6} on:click={verifyCode}>
        {loading ? '验证中…' : '登录'}
      </button>

      <div class="code-actions">
        <button
          type="button"
          class="linkish"
          disabled={loading}
          on:click={() => {
            step = 'email';
            error = '';
            code = '';
          }}
        >
          ← 更换邮箱
        </button>
        <button type="button" class="linkish" disabled={loading || resendCooldown > 0} on:click={resendCode}>
          {resendCooldown > 0 ? `重新发送 (${resendCooldown}s)` : '重新发送'}
        </button>
      </div>
    {/if}
  </main>

  <footer class="landing-note">
    <p class="footnote">note:建议搭配浓缩咖啡</p>
  </footer>
</div>

<style>
  .landing {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    min-height: 100vh;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    background: #050508;
    color: #ececed;
    padding: 1.25rem 1.25rem 2.5rem;
    box-sizing: border-box;
  }

  .landing-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .landing-bg-base {
    position: absolute;
    inset: 0;
    background: #050508;
  }

  .landing-bg-mesh {
    position: absolute;
    inset: -15% -10%;
    background:
      radial-gradient(ellipse 85% 52% at 50% -8%, rgba(94, 106, 210, 0.3), transparent 58%),
      radial-gradient(ellipse 65% 42% at 82% 58%, rgba(94, 106, 210, 0.1), transparent 52%),
      radial-gradient(ellipse 45% 38% at 12% 72%, rgba(94, 106, 210, 0.07), transparent 48%);
    animation: landing-mesh-drift 22s ease-in-out infinite alternate;
  }

  .landing-bg-blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(72px);
    will-change: transform;
  }

  .landing-bg-blob--1 {
    width: min(58vw, 440px);
    height: min(58vw, 440px);
    top: -12%;
    left: 18%;
    background: radial-gradient(
      circle at 35% 35%,
      rgba(120, 118, 230, 0.42) 0%,
      rgba(94, 106, 210, 0.18) 45%,
      transparent 72%
    );
    animation: landing-blob-1 26s ease-in-out infinite;
  }

  .landing-bg-blob--2 {
    width: min(48vw, 380px);
    height: min(48vw, 380px);
    bottom: 5%;
    right: -8%;
    background: radial-gradient(
      circle at 50% 50%,
      rgba(94, 106, 210, 0.35) 0%,
      rgba(70, 82, 180, 0.12) 55%,
      transparent 70%
    );
    animation: landing-blob-2 31s ease-in-out infinite;
  }

  .landing-bg-blob--3 {
    width: min(42vw, 320px);
    height: min(42vw, 320px);
    top: 42%;
    left: -12%;
    background: radial-gradient(
      circle at 60% 40%,
      rgba(94, 106, 210, 0.22) 0%,
      transparent 65%
    );
    animation: landing-blob-3 19s ease-in-out infinite;
  }

  .landing-bg-shimmer {
    position: absolute;
    inset: -50% -40%;
    background: linear-gradient(
      115deg,
      transparent 0%,
      transparent 38%,
      rgba(94, 106, 210, 0.06) 48%,
      rgba(148, 152, 240, 0.09) 52%,
      transparent 62%,
      transparent 100%
    );
    background-size: 200% 200%;
    animation: landing-shimmer 14s ease-in-out infinite;
    mix-blend-mode: screen;
    opacity: 0.85;
  }

  .landing-bg-vignette {
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 min(100px, 18vw) rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }

  @keyframes landing-mesh-drift {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(2.5%, 2%) scale(1.04);
      opacity: 0.92;
    }
  }

  @keyframes landing-blob-1 {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
    }
    33% {
      transform: translate(8%, 5%) scale(1.08);
    }
    66% {
      transform: translate(-4%, 10%) scale(0.96);
    }
  }

  @keyframes landing-blob-2 {
    0%,
    100% {
      transform: translate(0, 0) rotate(0deg);
    }
    50% {
      transform: translate(-10%, -6%) rotate(8deg) scale(1.06);
    }
  }

  @keyframes landing-blob-3 {
    0%,
    100% {
      transform: translate(0, 0);
      opacity: 0.9;
    }
    50% {
      transform: translate(14%, -8%);
      opacity: 1;
    }
  }

  @keyframes landing-shimmer {
    0%,
    100% {
      background-position: 0% 40%;
    }
    50% {
      background-position: 100% 60%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .landing-bg-mesh,
    .landing-bg-blob,
    .landing-bg-shimmer {
      animation: none;
    }
    .landing-bg-mesh {
      transform: none;
    }
  }

  .landing > :not(.landing-bg) {
    position: relative;
    z-index: 1;
  }

  .toast {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 120;
    max-width: min(84vw, 20rem);
    padding: 0.55rem 0.8rem;
    border-radius: 8px;
    font-size: 0.8125rem;
    color: #fecaca;
    background: rgba(235, 87, 87, 0.14);
    border: 1px solid rgba(235, 87, 87, 0.38);
    box-shadow: var(--shadow-panel);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  .top {
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
    padding: 0.25rem 0 1rem;
  }

  .top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.85rem;
  }

  .github-mark {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    color: #a1a1aa;
  }

  .github-icon {
    width: 18px;
    height: 18px;
    display: block;
    opacity: 0.9;
  }

  .logo {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.9375rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: #f4f4f5;
  }

  .logo-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    color: #d4d4d8;
    opacity: 0.92;
    transform: translateY(-0.5px);
    flex-shrink: 0;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    max-width: 34rem;
    width: 100%;
    margin: 0 auto;
    gap: 1.25rem;
  }

  .title {
    font-family: Inter, ui-sans-serif, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif;
    font-size: clamp(2.125rem, 6.5vw, 3rem);
    font-weight: 700;
    line-height: 1.2;
    margin: 0;
    color: #fafafa;
    letter-spacing: -0.04em;
  }

  .title-sm {
    font-size: clamp(1.75rem, 5vw, 2.25rem);
    font-weight: 600;
  }

  .desc {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.55;
    color: #9a9da8;
    max-width: 26rem;
  }

  .desc strong {
    color: #d4d4d8;
    font-weight: 500;
  }

  .landing-note {
    flex-shrink: 0;
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 0.75rem;
    text-align: center;
    box-sizing: border-box;
  }

  .footnote {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: #6b6f78;
    font-weight: 400;
    letter-spacing: 0.02em;
  }

  .alert {
    width: 100%;
    max-width: 26rem;
    font-size: 0.8125rem;
    color: #fecaca;
    background: rgba(235, 87, 87, 0.12);
    border: 1px solid rgba(235, 87, 87, 0.35);
    border-radius: 8px;
    padding: 0.65rem 0.9rem;
    text-align: left;
  }

  .email-bar {
    display: flex;
    width: 100%;
    max-width: 26rem;
    align-items: stretch;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.35);
    overflow: hidden;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
  }

  .email-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    padding: 0.85rem 1rem;
    font-size: 0.9375rem;
    font-family: ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, monospace;
    color: #f4f4f5;
    outline: none;
  }

  .email-input::placeholder {
    color: #6b6f78;
  }

  .email-input:disabled {
    opacity: 0.55;
  }

  .cta {
    flex-shrink: 0;
    border: none;
    padding: 0 1.15rem;
    background: #fafafa;
    color: #0a0a0b;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    cursor: pointer;
    transition: background 0.15s ease, opacity 0.15s ease;
  }

  .cta:hover:not(:disabled) {
    background: #fff;
  }

  .cta:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .cta-block {
    width: 100%;
    max-width: 26rem;
    padding: 0.85rem 1rem;
    border-radius: 10px;
  }

  .browse {
    font-size: 0.8125rem;
    color: #8b8e98;
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .browse:hover {
    color: #d4d4d8;
  }

  .code-wrap {
    width: 100%;
    max-width: 26rem;
  }

  .code-input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.35);
    padding: 0.9rem 1rem;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0.35em;
    text-align: center;
    color: #fafafa;
    font-family: ui-monospace, monospace;
    outline: none;
  }

  .code-input:focus {
    border-color: rgba(94, 106, 210, 0.55);
  }

  .code-input:disabled {
    opacity: 0.55;
  }

  .code-actions {
    display: flex;
    justify-content: space-between;
    width: 100%;
    max-width: 26rem;
    margin-top: 0.25rem;
  }

  .linkish {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.8125rem;
    color: #8b8e98;
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s ease;
  }

  .linkish:hover:not(:disabled) {
    color: #d4d4d8;
  }

  .linkish:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
