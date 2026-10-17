import { useEffect, useState } from "react";
import { Toaster as SonnerToaster } from "sonner";

type ToastPosition = "bottom-center" | "top-right";

export function Toaster() {
  const [position, setPosition] = useState<ToastPosition>("bottom-center");

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setPosition(mq.matches ? "top-right" : "bottom-center");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <>
      <SonnerToaster
        position={position}
        richColors={false}
        gap={8}
        toastOptions={{
          style: {
            background: "var(--color-canvas,#f7f5f2)",
            color: "var(--color-void,#1a1a1a)",
            border: "1px solid var(--linen,#e3ddcd)",
            borderRadius: "16px",
            fontSize: "14px",
          } as React.CSSProperties,
        }}
      />
      <style>{`[data-sonner-toaster]{z-index:60 !important}
@media (max-width:767px){[data-sonner-toaster]{left:16px !important;right:16px !important;bottom:calc(16px + env(safe-area-inset-bottom,0px)) !important;width:auto !important}}
@media (prefers-reduced-motion:reduce){[data-sonner-toaster] *{animation:none !important;transition:none !important}}`}</style>
    </>
  );
}

export default Toaster;
