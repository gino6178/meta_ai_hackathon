import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion, scrollBehavior } from "../hooks.js";

// Reveals the coach's messages one at a time and reports how many are shown, so the visual can follow along.
// With reduced motion the whole briefing is shown at once.
export function useTyping(messages, key) {
  const [shown, setShown] = useState(0);
  useEffect(() => { setShown(prefersReducedMotion() ? messages.length : 0); }, [key]);
  useEffect(() => {
    if (shown >= messages.length) return;
    const id = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 600 : 1700);
    return () => clearTimeout(id);
  }, [shown, messages.length, key]);
  return [shown, setShown];
}

export default function Briefing({ coach, messages, shown, onReplay, memoryHits }) {
  const box = useRef(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: scrollBehavior() }); }, [shown]);
  const typing = shown < messages.length;
  return (
    <div className="briefing">
      {memoryHits.length > 0 && (
        <div className="mem-used">
          <span className="tag">From your memory</span>
          {memoryHits.map(({ m, score }) => <span key={m.id} className="mem-chip" title={`relevance ${score.toFixed(2)}`}>{m.text}</span>)}
        </div>
      )}
      <div className="brief-chat" ref={box} aria-live="polite" aria-relevant="additions">
        {messages.slice(0, shown).map((m, i) => (
          <div key={i} className={`brief-msg ${i === shown - 1 ? "now" : ""}`}>
            {m.title && <b>{m.title}</b>}
            <p>{m.text}</p>
          </div>
        ))}
        {typing && <div className="brief-msg typing" aria-hidden="true"><p className="dots"><i /><i /><i /></p></div>}
      </div>
      <div className="brief-foot">
        <button className="btn ghost sm" onClick={onReplay} disabled={typing}>Replay briefing</button>
        <span className="tiny muted">Templated from the measured match facts and your memory. The chat below runs on Muse Glimmer.</span>
      </div>
    </div>
  );
}
