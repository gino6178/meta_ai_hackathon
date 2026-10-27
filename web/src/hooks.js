import { useEffect, useRef, useState } from "react";

// true when the viewer asked the system for less motion; follows changes while the page is open
const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
export const prefersReducedMotion = () => !!mq?.matches;
export function useReducedMotion() {
  const [on, setOn] = useState(prefersReducedMotion());
  useEffect(() => {
    if (!mq) return;
    const f = () => setOn(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return on;
}
export const scrollBehavior = () => (prefersReducedMotion() ? "auto" : "smooth");

// the rendered width of an element in CSS pixels, so SVG charts can draw text at its real size
export function useWidth(fallback = 600) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { const x = Math.round(e.contentRect.width); if (x > 0) setW(x); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
