#!/usr/bin/env bash
# Remote control for the live-stream server, run by cron every 2 minutes (setup_vps.sh installs it):
#  1. pulls main from GitHub: settings changes (live.settings.json) apply within a minute;
#     code changes in tools/ restart the autopilot.
#  2. pushes tools/live/status/status.json + the last 150 log lines to the `live-status` branch,
#     so the stream state can be checked from anywhere (no SSH needed).
# Needs push access to the repo on this server (see LIVE.md "Remote control").
set -uo pipefail
cd "$(dirname "$0")/../.."
REPO=$(pwd)
before=$(git rev-parse HEAD)
git pull -q --ff-only origin main || echo "pull failed"
after=$(git rev-parse HEAD)
if [ "$before" != "$after" ] && git diff --name-only "$before" "$after" | grep -qE '^tools/.*\.(js|html)$'; then
  pm2 restart scorebuzz-live >/dev/null && echo "$(date -Is) restarted after code update $after"
fi
W="$REPO/../scorebuzz-status"
if [ ! -d "$W" ]; then
  git fetch -q origin live-status 2>/dev/null && git worktree add -q "$W" live-status 2>/dev/null \
    || { git worktree add -q --detach "$W" && (cd "$W" && git checkout -q --orphan live-status && git rm -rqf . >/dev/null 2>&1); }
fi
cp tools/live/status/status.json "$W/status.json" 2>/dev/null
pm2 logs scorebuzz-live --nostream --lines 150 --raw > "$W/log.txt" 2>/dev/null
{ echo "server: $(hostname)  updated: $(date -Is)"; echo "commit: $after"; uptime; free -m | head -2; pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{for(const p of JSON.parse(s))console.log(p.name,p.pm2_env.status,"restarts",p.pm2_env.restart_time,"cpu",p.monit.cpu,"mem",Math.round(p.monit.memory/1e6)+"MB")}catch(e){}})'; } > "$W/server.txt"
cd "$W" && git add -A && git -c user.name="ScoreBuzz server" -c user.email="server@scorebuzz.net" commit -qm "status $(date -Is)" 2>/dev/null && git push -q origin HEAD:live-status 2>/dev/null
exit 0
