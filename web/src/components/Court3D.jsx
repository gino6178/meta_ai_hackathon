import { useEffect, useRef } from "react";
import { createCourt } from "../court3d.js";
import { useReducedMotion } from "../hooks.js";

// frame: controlled frame index; when `loop` is set the component plays the rally by itself
// range: [f0, f1] loops a single shot with its whole flight drawn as the trail
export default function Court3D({ rally, frame = 0, loop = false, range = null, interactive = false, autoRotate = false, variant = "report", className = "" }) {
  const ref = useRef(null);
  const api = useRef(null);
  const still = useReducedMotion();
  autoRotate = autoRotate && !still; // no idle camera spin when the viewer asked for less motion

  useEffect(() => {
    api.current = createCourt(ref.current, { interactive, autoRotate, frame: variant });
    return () => api.current.dispose();
  }, [interactive, autoRotate, variant]);

  useEffect(() => { if (rally) { api.current.setRally(rally); api.current.setFrame(frame); } }, [rally]);
  useEffect(() => { if (!loop) api.current?.setFrame(frame); }, [frame, loop]);

  useEffect(() => {
    if (!loop || !rally) return;
    let raf, start = performance.now();
    const [a, b] = range || [0, rally.n - 1];
    const span = b - a + 1;
    const tick = (t) => {
      const total = span + (range ? 30 : 45); // short hold at the end
      const i = Math.floor(((t - start) / 1000) * rally.fps * (range ? 0.6 : 1)) % total;
      api.current.setFrame(a + Math.min(i, span - 1), range ? span : 70);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loop, rally, range?.[0], range?.[1]]);

  return <canvas ref={ref} className={`court3d ${className}`} aria-label="3D court with the reconstructed shuttle flight" />;
}
