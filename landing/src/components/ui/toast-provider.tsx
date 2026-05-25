"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type ToastType = "success" | "error" | "info" | "warning";
type ToastItem = { type: ToastType; message: string } | null;

const ToastContext = createContext<{
  show: (type: ToastType, message: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem>(null);
  const timerRef = useRef<number | null>(null);

  const show = useCallback((type: ToastType, message: string) => {
    setToast({ type, message });
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const ms = type === "error" ? 5000 : type === "warning" ? 4500 : 3200;
    timerRef.current = window.setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <div className="toast-host pointer-events-none fixed top-6 left-1/2 z-[100] -translate-x-1/2 px-4" role="status">
          <div
            className={
              toast.type === "success"
                ? "pointer-events-auto max-w-md rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900 shadow-lg dark:border-green-800 dark:bg-green-950 dark:text-green-100"
                : toast.type === "error"
                  ? "pointer-events-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900 shadow-lg dark:border-red-800 dark:bg-red-950 dark:text-red-100"
                  : toast.type === "warning"
                    ? "pointer-events-auto max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-lg dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                    : "pointer-events-auto max-w-md rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            }
          >
            {toast.message}
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  const showSuccess = useCallback(
    (message: string) => ctx.show("success", message),
    [ctx],
  );
  const showError = useCallback(
    (message: string) => ctx.show("error", message),
    [ctx],
  );
  const showInfo = useCallback(
    (message: string) => ctx.show("info", message),
    [ctx],
  );
  const showWarning = useCallback(
    (message: string) => ctx.show("warning", message),
    [ctx],
  );

  return useMemo(
    () => ({ showSuccess, showError, showInfo, showWarning }),
    [showSuccess, showError, showInfo, showWarning],
  );
}
