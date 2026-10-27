// Player store on this machine: who is linked on Messenger, what each coach has learned about them (memory),
// the conversation so far, the latest agreed training plan, and the 24-hour coach's lists: food at home (pantry),
// calendar events and the training log. One JSON file; /forget wipes a player's entry.
import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve(process.env.STORE_FILE || "data/players.json");
let db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { players: {} };
const save = () => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db, null, 1)); };

// players linked before the 24-hour coach existed get its empty lists
const shape = (p) => { if (p) { p.pantry ??= []; p.events ??= []; p.logs ??= []; } return p; };
export const players = () => Object.values(db.players).map(shape);
export const get = (id) => shape(db.players[id]);
export function update(id, fn) { const p = get(id); if (p) { fn(p); save(); } return p; }

export function link(id, name) {
  db.players[id] ??= { id, name, athlete: "A", linkedAt: Date.now(), memories: [], history: [], plan: null, pantry: [], events: [], logs: [], prefs: { reminderHour: 7, coach: "head" } };
  db.players[id].name = name;
  save(); return db.players[id];
}
export function forget(id) { delete db.players[id]; save(); }

export function remember(id, items) {
  const p = db.players[id]; if (!p) return [];
  const fresh = items.filter((t) => t && !p.memories.some((m) => m.text.toLowerCase() === t.toLowerCase()));
  fresh.forEach((text) => p.memories.push({ text, at: Date.now(), source: "chat" }));
  p.memories = p.memories.slice(-40); save(); return fresh;
}

export function addTurn(id, role, content, meta = {}) {
  const p = db.players[id]; if (!p) return;
  p.history.push({ role, content, at: Date.now(), ...meta });
  p.history = p.history.slice(-60); save();
}

export function setPlan(id, plan) { const p = db.players[id]; if (p) { p.plan = { ...plan, at: Date.now() }; save(); } }
export function setPref(id, k, v) { const p = db.players[id]; if (p) { p.prefs[k] = v; save(); } }
export function markReminded(id, day, key = "lastReminder") { const p = db.players[id]; if (p) { p.prefs[key] = day; save(); } }
