#!/usr/bin/env bash
# Put one of the ScoreBuzz music beds (tools/music/*.wav, original and royalty-free) under a video.
# Usage: tools/add_music.sh in.mp4 hype|anthem|drama out.mp4
# The bed loops if needed, is cut to the video's length, and fades out over the last second.
# If in.sfx.json exists (written by make_shorts.js for results boards), a pop sound (tools/music/pop.wav)
# is mixed in at each listed time (the pop's impact lands ~0.07 s after its start, so it is shifted back).
set -euo pipefail
in="$1"; dir="$(dirname "$0")/music"; bed="$dir/$2.wav"; out="$3"
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
fo=$(python3 -c "print(max(0.0, $d - 1.0))")
sfx="${in%.mp4}.sfx.json"
if [ -f "$sfx" ]; then
  fc=$(python3 - "$sfx" "$fo" "$d" <<'PY'
import json, sys
ts = json.load(open(sys.argv[1])); fo, d = sys.argv[2], sys.argv[3]
parts = [f"[1:a]volume=0.75,afade=t=in:d=0.05,afade=t=out:st={fo}:d=1.0[bed]"]
n = len(ts)
parts.append(f"[2:a]asplit={n}" + "".join(f"[p{i}]" for i in range(n)))
for i, t in enumerate(ts):
    ms = max(0, int((t - 0.07) * 1000))
    parts.append(f"[p{i}]adelay={ms}|{ms}[q{i}]")
parts.append("[bed]" + "".join(f"[q{i}]" for i in range(n)) + f"amix=inputs={n+1}:normalize=0,alimiter=limit=0.95,atrim=0:{d}[aout]")
print(";".join(parts))
PY
)
  ffmpeg -loglevel error -y -i "$in" -stream_loop -1 -i "$bed" -i "$dir/pop.wav" \
    -filter_complex "$fc" -map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k -ar 44100 \
    -t "$d" -movflags +faststart "$out"
else
  ffmpeg -loglevel error -y -i "$in" -stream_loop -1 -i "$bed" \
    -map 0:v:0 -map 1:a:0 -c:v copy \
    -af "afade=t=in:d=0.05,afade=t=out:st=$fo:d=1.0" -c:a aac -b:a 192k -ar 44100 \
    -t "$d" -movflags +faststart "$out"
fi
