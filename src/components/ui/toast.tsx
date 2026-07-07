"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Kind = "success" | "error" | "info";
type Toast = { id: number; kind: Kind; message: string };

const ToastCtx = createContext<(kind: Kind, message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

const icons: Record<Kind, ReactNode> = {
  success: <CheckCircle2 className="size-4 text-success shrink-0" aria-hidden />,
  error: <XCircle className="size-4 text-danger shrink-0" aria-hidden />,
  info: <Info className="size-4 text-accent shrink-0" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: Kind, message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      kind === "error" ? 6000 : 3500,
    );
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className="flex items-start gap-2.5 bg-surface border border-line
                rounded-xl shadow-lg px-3.5 py-3 text-body"
            >
              {icons[t.kind]}
              <span className="min-w-0 break-words">{t.message}</span>
              <button
                aria-label="Dismiss"
                onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
                className="ml-auto text-ink-3 hover:text-ink transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
