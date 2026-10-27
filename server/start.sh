#!/usr/bin/env bash
# Start the Meta entry's server side: Muse Glimmer on its own Ollama (GPU 1, port 11435, models on the NAS) and the
# coach gateway on port 8790.
# Safe to run again: services already running are left alone.
#   ~/shuttlecoach-meta/start.sh          start
#   ~/shuttlecoach-meta/start.sh stop     stop the Meta services only (this also aborts an `ollama pull` in progress)
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="${NODE_BIN:-$HOME/shuttlecoach/node/bin/node}"
listening() { ss -ltn | grep -q ":$1 "; }

stop() {
  fuser -k 11435/tcp 8790/tcp 2>/dev/null
  echo "stopped"
}
[ "${1:-}" = "stop" ] && { stop; exit 0; }

# setsid -f forks each service into its own session, so it keeps running after this script (or an ssh session) ends
if ! listening 11435; then
  cd "$ROOT/ollama" && setsid -f ./serve.sh >> "$ROOT/ollama/ollama.log" 2>&1 < /dev/null
  echo "Muse Glimmer (Ollama) starting on :11435, GPU 1, log: $ROOT/ollama/ollama.log"
  # load the model now: the first load reads about 17 GB from the NAS and takes a few minutes
  setsid -f bash -c 'sleep 5; curl -s -m 600 127.0.0.1:11435/api/generate -d "{\"model\":\"muse-glimmer\",\"prompt\":\"\",\"keep_alive\":\"24h\"}" > /dev/null' < /dev/null > /dev/null 2>&1
else echo "Ollama :11435 already running"; fi

if ! listening 8790; then
  cd "$ROOT/agent" && PORT=8790 LLM_URL=http://127.0.0.1:11435/v1 LLM_MODEL=muse-glimmer LLM_DEVICE="RTX 3090 (CUDA)" \
    EMBED_URL=http://127.0.0.1:11434 ALLOW_ORIGINS=http://127.0.0.1:5191,http://localhost:5191 \
    REEL_PYTHON="${REEL_PYTHON:-$HOME/miniconda3/envs/isaac/bin/python}" REEL_SCRIPT="$ROOT/pose/reel.py" REEL_GPU=0 \
    REEL_HF_CACHE="${REEL_HF_CACHE:-/mnt/nas/shuttlecoach-meta/hf}" \
    setsid -f "$NODE_BIN" --unhandled-rejections=warn src/server.js >> "$ROOT/agent/gateway.log" 2>&1 < /dev/null
  echo "$(date "+%F %T") gateway starting on :8790 -> muse-glimmer" >> "$ROOT/agent/gateway.log"
  echo "gateway starting on :8790 -> muse-glimmer, log: $ROOT/agent/gateway.log"
else echo "gateway :8790 already running (restart with: $0 stop && $0)"; fi
