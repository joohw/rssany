import styles from "@/app/page.module.css";

export function LandingBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background" aria-hidden>
      <div className={`absolute inset-0 ${styles.landingBackdrop}`} />
      <div className={`absolute inset-0 ${styles.landingBackdropVeil}`} />
    </div>
  );
}
