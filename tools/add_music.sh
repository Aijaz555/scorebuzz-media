#!/usr/bin/env bash
# Put one of the ScoreBuzz music beds (tools/music/*.wav, original and royalty-free) under a video.
# Usage: tools/add_music.sh in.mp4 hype|anthem|drama out.mp4
# The bed loops if needed, is cut to the video's length, and fades out over the last second.
set -euo pipefail
in="$1"; bed="$(dirname "$0")/music/$2.wav"; out="$3"
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
fo=$(python3 -c "print(max(0.0, $d - 1.0))")
ffmpeg -loglevel error -y -i "$in" -stream_loop -1 -i "$bed" \
  -map 0:v:0 -map 1:a:0 -c:v copy \
  -af "afade=t=in:d=0.05,afade=t=out:st=$fo:d=1.0" -c:a aac -b:a 192k -ar 44100 \
  -t "$d" -movflags +faststart "$out"
