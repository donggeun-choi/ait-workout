import { Device, SafeArea, Screen, Storage } from "@apps-in-toss/web-framework";
import { useEffect } from "react";
import { createRecordStorage } from "./record-storage";

function hasNativeHost() {
  try {
    return Device.os === "ios" || Device.os === "android";
  } catch {
    return false;
  }
}
export const recordStorage = createRecordStorage(
  "workout-log-v1",
  hasNativeHost() ? Storage : null,
  localStorage,
);

let awakeQueue: Promise<unknown> = Promise.resolve();
export function usePlatformScreen(keepAwake: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    const apply = (insets: ReturnType<typeof SafeArea.get>) => {
      for (const side of ["top", "bottom", "left", "right"] as const) {
        const value = insets[side];
        if (Number.isFinite(value) && value >= 0)
          root.style.setProperty(`--host-safe-${side}`, `${value}px`);
      }
    };
    let unsubscribe: (() => void) | undefined;
    try {
      apply(SafeArea.get());
      unsubscribe = SafeArea.subscribe({ onEvent: apply });
    } catch {
      /* Browser keeps CSS env() fallback. */
    }
    return () => {
      unsubscribe?.();
      for (const side of ["top", "bottom", "left", "right"])
        root.style.removeProperty(`--host-safe-${side}`);
    };
  }, []);
  useEffect(() => {
    if (!keepAwake || !hasNativeHost()) return;
    const update = (enabled: boolean) => {
      awakeQueue = awakeQueue
        .catch(() => {})
        .then(() => Screen.setAwakeMode({ enabled }))
        .catch(() => {});
    };
    const onVisibility = () => update(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      update(false);
    };
  }, [keepAwake]);
}
export function completedSetFeedback() {
  try {
    void Device.triggerHaptic({ type: "tickWeak" }).catch(() => {});
  } catch {
    /* Feedback must not interrupt recording. */
  }
}
