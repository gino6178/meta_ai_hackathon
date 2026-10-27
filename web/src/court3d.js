// Three.js court with the rally's 3D shuttle flight. Court metres map to world units: x -> X, y -> Z, height -> Y.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { COURT, speedColor } from "./data.js";

const W = (x, y, z) => new THREE.Vector3(x - COURT.W / 2, z, y - COURT.NET);

function courtLines() {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0xdfe8e4, transparent: true, opacity: .85 });
  const seg = (a, b) => g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([W(a[0], a[1], 0.002), W(b[0], b[1], 0.002)]), mat));
  const { W: w, L, NET, SHORT, LONG_D, SINGLE } = COURT;
  [0, w].forEach((x) => seg([x, 0], [x, L]));
  [SINGLE, w - SINGLE].forEach((x) => seg([x, 0], [x, L]));
  [0, L, LONG_D, L - LONG_D, NET - SHORT, NET + SHORT].forEach((y) => seg([0, y], [w, y]));
  seg([w / 2, 0], [w / 2, NET - SHORT]); seg([w / 2, NET + SHORT], [w / 2, L]);
  return g;
}

export function createCourt(canvas, { interactive = false, autoRotate = false, frame = "report" } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x04070a, 18, 42);
  const camera = new THREE.PerspectiveCamera(frame === "hero" ? 32 : 38, 1, .1, 100);
  if (frame === "hero") camera.position.set(10.5, 6.2, 13.5); else camera.position.set(8.5, 7.5, 11.5);
  camera.lookAt(0, .6, 0);

  scene.add(new THREE.AmbientLight(0xffffff, .55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(4, 12, 6); scene.add(sun);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 18), new THREE.MeshStandardMaterial({ color: 0x0c1714, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.003; scene.add(floor);
  const court = new THREE.Mesh(new THREE.PlaneGeometry(COURT.W, COURT.L), new THREE.MeshStandardMaterial({ color: 0x1f6b54, roughness: .9 }));
  court.rotation.x = -Math.PI / 2; scene.add(court);
  scene.add(courtLines());

  const net = new THREE.Mesh(new THREE.PlaneGeometry(COURT.W + .2, .76),
    new THREE.MeshBasicMaterial({ color: 0x0b0f12, transparent: true, opacity: .72, side: THREE.DoubleSide }));
  net.position.set(0, 1.524 - .38, 0); scene.add(net);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(COURT.W + .2, .04, .02), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }));
  tape.position.set(0, 1.524, 0); scene.add(tape);
  [-1, 1].forEach((s) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.55), new THREE.MeshStandardMaterial({ color: 0x9aa3a6 }));
    post.position.set(s * (COURT.W / 2 + .1), .775, 0); scene.add(post);
  });

  const trail = new THREE.Group(); scene.add(trail);
  const ghost = new THREE.Group(); scene.add(ghost);
  const shuttle = new THREE.Mesh(new THREE.SphereGeometry(.07, 20, 16), new THREE.MeshBasicMaterial({ color: 0xf2e6c9 }));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(.2, 20, 16), new THREE.MeshBasicMaterial({ color: 0xf2e6c9, transparent: true, opacity: .18 }));
  shuttle.add(glow); shuttle.visible = false; scene.add(shuttle);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.09, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .45 }));
  shadow.rotation.x = -Math.PI / 2; shadow.visible = false; scene.add(shadow);
  const markers = new THREE.Group(); scene.add(markers);

  let controls = null;
  if (interactive) {
    controls = new OrbitControls(camera, canvas);
    controls.target.set(0, .6, 0); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .48;
    controls.minDistance = 6; controls.maxDistance = 30;
  }

  let rally = null;
  function setRally(r) {
    rally = r;
    ghost.clear();
    // faint full-rally path, so the whole exchange is readable even when paused
    const pts = []; r.frames.forEach((f) => f.xyz && pts.push(W(...f.xyz)));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    ghost.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .12 })));
    markers.clear();
    r.strokes.forEach((s) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(.12, .17, 32), new THREE.MeshBasicMaterial({ color: s.hitter === "near" ? 0x6fb6ff : 0xff8a6b, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.copy(W(s.contact[0], s.contact[1], .01)); markers.add(m);
    });
  }

  // draw the speed-coloured trail of the last `tail` frames up to frame i
  function setFrame(i, tail = 60) {
    if (!rally) return;
    trail.clear();
    const lo = Math.max(0, i - tail);
    for (let k = lo + 1; k <= i; k++) {
      const a = rally.frames[k - 1], b = rally.frames[k];
      if (!a?.xyz || !b?.xyz || a.s !== b.s) continue;
      const col = new THREE.Color(speedColor(rally.speed[k] || 0));
      const fade = (k - lo) / (i - lo + 1);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([W(...a.xyz), W(...b.xyz)]),
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: .25 + .75 * fade }));
      trail.add(line);
    }
    const f = rally.frames[i];
    shuttle.visible = shadow.visible = !!f?.xyz;
    if (f?.xyz) { shuttle.position.copy(W(...f.xyz)); shadow.position.copy(W(f.xyz[0], f.xyz[1], .004)); }
    renderer.render(scene, camera);
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // hero: push the court into the right half so the headline keeps a clean field on the left
    if (frame === "hero" && w > 900) camera.setViewOffset(w, h, -w * .24, -h * .02, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  let raf, t0 = performance.now();
  const loop = (t) => {
    if (autoRotate) {
      // slow sway around a side-on view; a full orbit brings the near baseline too close to the camera
      const a = 1.15 + .38 * Math.sin((t - t0) / 1000 * .07);
      camera.position.set(Math.sin(a) * 23, 8.2, Math.cos(a) * 23); camera.lookAt(0, 1.1, 0);
    }
    controls?.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    setRally, setFrame,
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); controls?.dispose(); renderer.dispose(); },
  };
}
