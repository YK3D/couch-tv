#!/bin/sh
# The live broadcast from Masjid al-Haram for a TV with no satellite tuner (the LG), from the same dish,
# over the home network: no internet used. docs/FAMILY.md, "The LG and the satellite".
#
#   scripts/haram-lan-stream.sh <source address> [copy|small]
#
# <source address> is the Quran channel from a satellite tuner this computer can read, for example
#   TVHeadend with a USB DVB-S2 tuner:  http://localhost:9981/stream/channel/<channel id>?profile=pass
#   a SAT>IP box (Digibit and others):   rtsp://192.0.2.50/?src=1&freq=...&pol=h&msys=dvbs2&sr=...&pids=...
# "copy" (the default) passes the picture on as it comes, which costs this computer almost nothing but needs
# the channel to be H.264 (most HD channels are). "small" re-encodes it to 640x360, for an SD (MPEG-2)
# channel or a slow network; a Raspberry Pi 4 or newer manages that.
#
# It writes a rolling HLS stream into tv-home/web/family/live/ (git ignored), which the bridge serves at
#   http://<this computer>:5400/tv/family/live/index.m3u8
# Put that address in config.json as the LG's family.haram.dish_url. Keep this running while the TV is on
# (a launchd or systemd service, like the bridge's own: bridge/examples/).
set -eu
SRC="${1:-}"
MODE="${2:-copy}"
if [ -z "$SRC" ]; then
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg is needed: brew install ffmpeg (Mac) or sudo apt install ffmpeg (Linux)"; exit 1; }
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/tv-home/web/family/live"
mkdir -p "$OUT"
rm -f "$OUT"/*.ts "$OUT"/index.m3u8

case "$MODE" in
  copy)  VIDEO="-c:v copy" ;;
  small) VIDEO="-c:v libx264 -preset veryfast -tune zerolatency -vf scale=-2:360 -b:v 700k -maxrate 900k -bufsize 1400k -g 50" ;;
  *) echo "the mode is copy or small"; exit 2 ;;
esac

echo "Haram live: $SRC -> $OUT/index.m3u8 ($MODE). Ctrl-C to stop."
# Six 4 second pieces are kept: a TV joins at most about 20 seconds behind the dish.
# shellcheck disable=SC2086
exec ffmpeg -hide_banner -loglevel warning -fflags +genpts -i "$SRC" \
  -map 0:v:0 -map 0:a:0 $VIDEO -c:a aac -b:a 96k -ac 2 \
  -f hls -hls_time 4 -hls_list_size 6 -hls_flags delete_segments+omit_endlist+temp_file \
  -hls_segment_filename "$OUT/seg-%05d.ts" "$OUT/index.m3u8"
