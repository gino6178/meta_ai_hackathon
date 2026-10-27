import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// 3D muscles + skeleton (BodyParts3D via Human Atlas). Muscles in a coaching region take that region's colour;
// clicking a muscle selects its region. The model faces +Z, Y up, metres.

let bodyCache;
function loadBody(onProgress) {
  if (!bodyCache) bodyCache = (async () => {
    const meta = await fetch("/body/body.json").then((r) => r.json());
    const res = await fetch("/body/body.bin");
    const total = +res.headers.get("content-length") || 0;
    const reader = res.body.getReader(); const parts = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onProgress?.(total ? got / total : 0); }
    const buf = new Uint8Array(got); let o = 0; parts.forEach((p) => { buf.set(p, o); o += p.length; });
    return { meta, buffer: buf.buffer };
  })();
  return bodyCache;
}

const COL = { base: 0x4a4447, s: 0xff5a48, m: 0x5aaeff, bone: 0xe8e0d0 };

// high priority glows in full colour, medium is a muted tint, everything else stays neutral grey
function regionColor(st) {
  if (!st || st.level === "low") return { c: new THREE.Color(COL.base), e: 0 };
  const c = new THREE.Color(st.kind === "m" ? COL.m : COL.s);
  return st.level === "high"
    ? { c: new THREE.Color(COL.base).lerp(c, .75 + .25 * st.v), e: .25 + .3 * st.v }
    : { c: new THREE.Color(COL.base).lerp(c, .38), e: .06 };
}

export default function Body3D({ scores, sel, onSel, view, pulse = null, height }) {
  const ref = useRef(null);
  const api = useRef({});
  const [prog, setProg] = useState(0);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const canvas = ref.current;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, .05, 20);
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x1a1210, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1.5, 2.5, 2.5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc8ff, 1.0); rim.position.set(-2, 1.5, -2.5); scene.add(rim);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.enablePan = false; controls.minDistance = .8; controls.maxDistance = 5;
    const group = new THREE.Group(); scene.add(group);
    const muscles = [];

    let disposed = false;
    loadBody(setProg).then(({ meta, buffer }) => {
      if (disposed) return;
      const boneMat = new THREE.MeshStandardMaterial({ color: COL.bone, roughness: .8, transparent: true, opacity: .55 });
      meta.parts.forEach((p) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer, p.pos, p.n * 3), 3));
        g.setAttribute("normal", new THREE.BufferAttribute(new Int16Array(buffer, p.nor, p.n * 3), 3, true));
        g.setIndex(new THREE.BufferAttribute(p.wide ? new Uint32Array(buffer, p.idx, p.m) : new Uint16Array(buffer, p.idx, p.m), 1));
        if (p.kind === "bone") { group.add(new THREE.Mesh(g, boneMat)); return; }
        const mat = new THREE.MeshStandardMaterial({ color: COL.base, roughness: .55, metalness: .05 });
        const mesh = new THREE.Mesh(g, mat); mesh.userData = { region: p.region, name: p.name };
        group.add(mesh); muscles.push(mesh);
      });
      const box = new THREE.Box3().setFromObject(group), c = box.getCenter(new THREE.Vector3());
      group.position.sub(c); controls.target.set(0, 0, 0);
      api.current.size = box.getSize(new THREE.Vector3());
      api.current.frame("front");
      setReady(true);
    }).catch(() => setErr("The 3D body model could not be loaded."));

    api.current.paint = (scores, sel) => muscles.forEach((m) => {
      const r = m.userData.region, { c, e } = regionColor(scores[r]);
      m.material.color.copy(c);
      m.material.emissive.copy(r && r === sel ? new THREE.Color(0xf2e6c9) : c);
      m.material.emissiveIntensity = r && r === sel ? .45 : e;
    });
    // camera distance that fits the whole body, head to feet, in this canvas's aspect ratio (with a margin)
    api.current.fit = () => {
      const s = api.current.size; if (!s) return 3.1;
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), wide = Math.max(s.x, s.z);
      return Math.max((s.y * .56) / t, (wide * .62) / (t * camera.aspect)) + wide / 2;
    };
    api.current.frame = (v) => {
      const d = api.current.fit(), a = { front: 0, back: Math.PI, side: Math.PI / 2 }[v] ?? 0;
      controls.maxDistance = Math.max(5, d * 1.6);
      camera.position.set(Math.sin(a) * d, .05, Math.cos(a) * d); controls.update();
    };

    // click (not drag) selects the region under the pointer
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down;
    const onDown = (e) => (down = [e.clientX, e.clientY]);
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = canvas.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const hit = ray.intersectObjects(muscles, false).find((h) => h.object.userData.region);
      if (hit) api.current.onSel?.(hit.object.userData.region);
    };
    canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointerup", onUp);

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      // keep the whole body in view when the canvas changes shape
      if (api.current.size) { const d = api.current.fit(); controls.maxDistance = Math.max(5, d * 1.6); camera.position.setLength(d); controls.update(); }
    };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
    // pulse: muscles in the listed regions throb so the coach can point at them
    let lastPulse = false;
    const pulseTick = (now) => {
      const set = api.current.pulse;
      if (!set || !set.length) {
        if (lastPulse) { api.current.paint?.(api.current.scores || {}, api.current.sel); lastPulse = false; }
        return;
      }
      lastPulse = true;
      const k = 0.5 + 0.5 * Math.sin(now / 1000 * Math.PI * 2 * 1.1);
      muscles.forEach((m) => {
        if (!set.includes(m.userData.region)) return;
        m.material.emissive.set(m.userData.region === api.current.sel ? 0xfff1d6 : 0xff5a48);
        m.material.emissiveIntensity = 0.15 + 0.85 * k;
      });
    };
    let raf; const loop = (now) => { controls.update(); pulseTick(now || 0); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointerup", onUp);
      group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      renderer.dispose();
    };
  }, []);

  useEffect(() => { api.current.onSel = onSel; }, [onSel]);
  useEffect(() => {
    api.current.scores = scores; api.current.sel = sel;
    if (ready) api.current.paint(scores, sel);
  }, [ready, scores, sel]);
  useEffect(() => { api.current.pulse = pulse; }, [pulse]);
  useEffect(() => { if (ready) api.current.frame(view); }, [ready, view]);

  return (
    <div className="body3d" style={height ? { height } : undefined}>
      <canvas ref={ref} aria-label="3D muscle model; click a muscle to see why it matters" />
      {!ready && !err && <div className="body3d-load"><span className="mono">Loading anatomy · {Math.round(prog * 100)}%</span><i style={{ transform: `scaleX(${prog})` }} /></div>}
      {err && <div className="body3d-load err">{err}</div>}
    </div>
  );
}
