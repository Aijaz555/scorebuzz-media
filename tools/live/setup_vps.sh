#!/usr/bin/env bash
# One-time setup for an Ubuntu 22.04/24.04 server that runs ScoreBuzz live scoreboard streams.
#   git clone https://github.com/Aijaz555/scorebuzz-media && cd scorebuzz-media && bash tools/live/setup_vps.sh
set -euo pipefail
sudo apt-get update
sudo apt-get install -y ffmpeg curl git fonts-inter || sudo apt-get install -y ffmpeg curl git
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
npm install playwright
sudo npx playwright install-deps chromium
npx playwright install chromium
sudo npm install -g pm2
[ -f tools/live/live.config.json ] || cp tools/live/live.config.example.json tools/live/live.config.json
echo
echo "Done. Next:"
echo "  1. Put your YouTube stream keys in tools/live/live.config.json"
echo "  2. Check the data feed:   node tools/live/games.js nba nfl epl"
echo "  3. Start the autopilot:   pm2 start tools/live/autopilot.js --name scorebuzz-live -- tools/live/live.config.json && pm2 save && pm2 startup"
