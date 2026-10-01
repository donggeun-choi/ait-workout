import { TossAds } from "@apps-in-toss/web-framework";
import { useEffect, useRef, useState } from "react";

const testBannerId = "ait-ad-test-banner-id";
const adGroupId = import.meta.env.DEV
  ? testBannerId
  : (import.meta.env.VITE_TOSS_BANNER_AD_GROUP_ID ?? "").trim();
// One initialization shared across screen mounts and React StrictMode effects.
let initialization: Promise<boolean> | undefined;
function initializeAds() {
  if (!initialization) {
    initialization = new Promise<boolean>((resolve) => {
      try {
        if (
          !TossAds.initialize.isSupported() ||
          !TossAds.attachBanner.isSupported()
        ) {
          resolve(false);
          return;
        }
        TossAds.initialize({
          callbacks: {
            onInitialized: () => resolve(true),
            onInitializationFailed: () => resolve(false),
          },
        });
      } catch {
        resolve(false);
      }
    });
  }
  return initialization;
}

export function BannerAd() {
  const target = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(!adGroupId);
  useEffect(() => {
    if (!adGroupId || unavailable) return;
    let disposed = false;
    let attached: ReturnType<typeof TossAds.attachBanner> | undefined;
    const fail = () => {
      if (!disposed) setUnavailable(true);
    };
    void initializeAds().then((ready) => {
      if (disposed) return;
      if (!ready || !target.current) {
        fail();
        return;
      }
      try {
        attached = TossAds.attachBanner(adGroupId, target.current, {
          theme: "light",
          tone: "grey",
          variant: "expanded",
          callbacks: { onNoFill: fail, onAdFailedToRender: fail },
        });
      } catch {
        fail();
      }
    });
    return () => {
      disposed = true;
      attached?.destroy();
    };
  }, [unavailable]);
  // Unsupported environments and no-fill leave no fake ad or empty slot.
  if (unavailable) return null;
  return (
    <aside className="dashboard-ad" aria-label="광고">
      <div ref={target} />
    </aside>
  );
}
