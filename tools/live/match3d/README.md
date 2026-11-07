# 3D match view (prototype)
Broadcast-style 3D football view driven by live data. Open index.html over http (not file://), e.g. `python3 -m http.server` in this folder, with ?event=<ESPN id>&league=eng.1.
- Player model: models/Xbot.glb (Mixamo character + idle/walk/run motion capture, from the three.js examples). Kits are painted per vertex by bone.
- three.js r160 in vendor/ (MIT).
- Player positions are illustrative (formation + live attack zone + events), not tracking data; the on-screen note says so.
