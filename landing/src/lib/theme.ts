export const THEME_BOOT_SCRIPT = `(() => {
  try {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const root = document.documentElement;
    const sync = () => {
      root.classList.toggle("dark", media.matches);
      root.style.colorScheme = media.matches ? "dark" : "light";
    };
    sync();
    media.addEventListener("change", sync);
  } catch {}
})();`;
