import { useEffect, useRef, useState } from "react";
import { loadMatches } from "../match/analytics.js";
import { answer, EXAMPLES } from "./intents.js";
import { go } from "../App.jsx";
import Icon from "../components/Icon.jsx";

// Ask out loud: tap the mic, ask your agent, get a spoken answer and the view that shows it.
// Speech is recognised in the browser by Whisper tiny; no audio or text leaves the device.
let worker = null, seq = 0;
const pending = new Map();
function asr(audio) {
  if (!worker) {
    worker = new Worker(new URL("./whisper.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { const cb = pending.get(e.data.id); if (cb) cb(e.data); };
  }
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (msg) => {
      if (msg.status === "done" || msg.status === "ready") { pending.delete(id); resolve(msg); }
      if (msg.status === "error") { pending.delete(id); reject(new Error(msg.error)); }
    });
    worker.postMessage({ id, audio });
  });
}

async function toPcm(blob) {
  const ctx = new AudioContext({ sampleRate: 16000 });
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  return buf.getChannelData(0);
}

function speak(text) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  // only on-device voices, so the answer is never sent to a cloud speech service
  const v = synth.getVoices().find((x) => x.localService && /^en/i.test(x.lang));
  if (!v) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text); u.voice = v; u.rate = 1.05;
  synth.speak(u);
}

export default function VoiceCoach({ data }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState("idle"); // idle | listening | thinking
  const [log, setLog] = useState([]);
  const [typed, setTyped] = useState("");
  const [m, setM] = useState(null);
  const rec = useRef(null);
  useEffect(() => { loadMatches().then((d) => setM(d.matches[0])); }, []);
  const btn = useRef(null);
  // Escape closes the panel and gives focus back to the button that opened it
  useEffect(() => {
    if (!open) return;
    const key = (e) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    addEventListener("keydown", key); return () => removeEventListener("keydown", key);
  }, [open]);

  const respond = (text, ms) => {
    if (!m || !data) return;
    const a = answer(text, { m, data });
    setLog((l) => [{ q: text, a: a.say, ms }, ...l].slice(0, 4));
    speak(a.say);
    if (a.go) go(a.go);
  };

  const transcribe = async (audio) => {
    setState("thinking");
    try {
      const r = await asr(audio);
      respond(r.text || "(nothing heard)", r.ms);
    } catch (err) {
      setLog((l) => [{ q: "Speech model error", a: String(err.message) }, ...l]);
    }
    setState("idle");
  };

  const toggle = async () => {
    if (state === "listening") { rec.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [], mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); transcribe(await toPcm(new Blob(chunks))); };
      rec.current = mr; mr.start(); setState("listening");
      setTimeout(() => mr.state === "recording" && mr.stop(), 8000);
    } catch {
      setLog((l) => [{ q: "Microphone unavailable", a: "Allow the microphone, or type the question below." }, ...l]);
    }
  };

  // test hook: transcribe an audio file (used to verify the offline pipeline without a microphone)
  useEffect(() => { window.__voiceFile = async (url) => transcribe(await toPcm(await (await fetch(url)).blob())); });

  return (
    <>
      <button ref={btn} className={`voice-btn ${state}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Ask out loud" title="Ask your agent out loud">
        <Icon name="mic" size={22} /><span className="lbl">Ask out loud</span>
      </button>
      {open && (
        <aside className="voice-panel" role="dialog" aria-label="Ask out loud">
          <header><b>Ask out loud</b><span className="tiny muted">Speech is recognised in this browser; no audio leaves the device.</span>
            <button className="icon-btn sm" aria-label="Close" onClick={() => { setOpen(false); btn.current?.focus(); }}><Icon name="close" size={16} /></button></header>
          <button className={`voice-mic ${state}`} onClick={toggle} disabled={state === "thinking"}>
            <i />{state === "listening" ? "Listening… tap to stop" : state === "thinking" ? "Transcribing on-device…" : "Tap and ask a question"}
          </button>
          <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { respond(typed.trim()); setTyped(""); } }}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="…or type it" aria-label="Type a question" />
          </form>
          {!log.length && <ul className="voice-ex">{EXAMPLES.map((x) => <li key={x}><button onClick={() => respond(x)}>“{x}”</button></li>)}</ul>}
          {log.map((x, k) => (
            <div key={k} className="voice-turn" aria-live={k === 0 ? "polite" : undefined}>
              <p className="q">“{x.q}”{x.ms ? <span className="tiny muted"> · {x.ms} ms</span> : null}</p>
              <p className="a">{x.a}</p>
            </div>
          ))}
        </aside>
      )}
    </>
  );
}
