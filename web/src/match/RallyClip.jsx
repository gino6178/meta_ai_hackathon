import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import CourtMap from "../components/CourtMap.jsx";

const COLOR = { A: "var(--near)", B: "var(--far)" };

// A rally clip with its labelled shots: live shot caption, a shot timeline and a mini-map that fills as the rally plays.
const RallyClip = forwardRef(function RallyClip({ rally, names, autoPlay = true, onEnded, minimap = true, live = false, children }, ref) {
  const vid = useRef(null);
  const [t, setT] = useState(0);
  useImperativeHandle(ref, () => ({ video: vid.current, seek: (s) => { vid.current.currentTime = s; } }), []);
  useEffect(() => { setT(0); }, [rally?.i]);
  if (!rally) return null;
  const shown = rally.shots.filter((s) => s.t <= t + 0.05);
  const cur = shown[shown.length - 1];
  const done = t >= rally.end;
  return (
    <div className={`rclip ${live ? "live" : ""}`}>
      <div className="rclip-stage">
        <video ref={vid} key={rally.clip} src={rally.clip ? `/media/rallies/${rally.clip}` : undefined} autoPlay={autoPlay} muted playsInline controls={!live}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onEnded={onEnded} />
        {cur && !done && (
          <div className="rclip-cap" key={shown.length}>
            <i style={{ background: COLOR[cur.p] }} /><b>{cur.type}</b><span>{names[cur.p]} · shot {shown.length}</span>
          </div>
        )}
        {done && (
          <div className="rclip-cap end">
            <b>Point {names[rally.winner]}</b><span>{rally.reason === "winner" ? `${rally.lastType} winner` : `${names[rally.lastBy]}: ${rally.reason}`} · {rally.score[0]}–{rally.score[1]}</span>
          </div>
        )}
        {children}
      </div>
      <div className="rclip-line" aria-label="Shots in this rally">
        {rally.shots.map((s, k) => (
          <button key={k} style={{ left: `${(s.t / rally.dur) * 100}%`, background: COLOR[s.p] }} className={s.t <= t ? "on" : ""}
            title={`${k + 1}. ${s.type} (${names[s.p]})`} onClick={() => { vid.current.currentTime = Math.max(0, s.t - 0.4); vid.current.play(); }} />
        ))}
        <span className="rclip-head" style={{ left: `${Math.min(100, (t / rally.dur) * 100)}%` }} />
      </div>
      {minimap && (
        <div className="rclip-map">
          <CourtMap half="full" label="Shot landings so far"
            points={shown.filter((s) => s.land).map((s, k) => ({ xy: s.land, c: COLOR[s.p], r: k === shown.length - 1 ? 7 : 4, o: k === shown.length - 1 ? 1 : .55 }))} />
        </div>
      )}
    </div>
  );
});
export default RallyClip;
