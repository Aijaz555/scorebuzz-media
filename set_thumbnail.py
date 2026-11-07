#!/usr/bin/env python3
"""Set a custom thumbnail on a YouTube video via the Data API (thumbnails.set).

Why this exists: on 2026-11-07 the Leeds vs Tottenham live stream's thumbnail
was set correctly in LiveReacting Studio but YouTube never picked it up, and
the YouTube Studio browser route was blocked (no saved login for the Google
account that owns @Scorebuzznet). This script is the bypass: it uses the
YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN repo secrets (saved
2026-11-07 in Aijaz555/scorebuzz-media) to call thumbnails.set directly on
the live video. It sets a thumbnail on an already-public video -- it does
NOT upload a video, so the 2026-11-04 finding that new-API-project video
uploads stay private until Google's audit does not apply here.

Usage (in GitHub Actions; secrets are injected as env vars, never printed):
    python3 set_thumbnail.py --video-id YxZ9J0BpKp4 \
        --thumbnail assets/thumbnails/leeds-vs-tottenham-v3-2026-11-07.jpg

    python3 set_thumbnail.py --video-id <id> --thumbnail <file> --dry-run
        # validates the file only; makes no Google calls

Exit codes: 0 = thumbnail set (API returned 200); 1 = failed (see message).
Known failure modes:
  - 401 invalid_grant: refresh token expired/revoked, or wrong client.
    If the OAuth consent screen is still in Testing, refresh tokens die
    after 7 days -- the token was issued 2026-11-07, so re-auth is needed
    after ~2026-11-14 unless the app is published to Production.
  - 403 (channel not verified / insufficient permissions): the channel must
    be phone-verified for custom thumbnails; if Studio can't upload a
    thumbnail manually, the API can't either. Also check the token's scope
    includes youtube.upload (thumbnails.set accepts youtube.upload,
    youtube, youtube.force-ssl or youtubepartner).
  - 404: wrong videoId, or the token belongs to a different channel.
Note: YouTube says thumbnail changes "may take time" to appear; check the
watch page a few minutes after a 200, don't re-send on a delay alone.
"""

import argparse
import json
import os
import sys

import requests

TOKEN_URL = "https://oauth2.googleapis.com/token"
SET_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"
VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
MAX_BYTES = 50 * 1024 * 1024  # API limit; our files are ~110 KB


def fail(msg, code=1):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def refresh_access_token(client_id, client_secret, refresh_token):
    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
        },
        timeout=30,
    )
    if resp.status_code != 200:
        fail(f"token refresh failed ({resp.status_code}): {resp.text[:300]}")
    token = resp.json().get("access_token")
    if not token:
        fail("token refresh returned no access_token")
    return token


def set_thumbnail(access_token, video_id, image_bytes):
    resp = requests.post(
        SET_URL,
        params={"videoId": video_id},
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "image/jpeg",
        },
        data=image_bytes,
        timeout=60,
    )
    return resp


def verify(access_token, video_id):
    """Best-effort read-back. May 403 if the token lacks a read scope
    (youtube.upload alone is enough for the set, not for this read) --
    that is a warning only, not a failure."""
    try:
        resp = requests.get(
            VIDEOS_URL,
            params={"part": "snippet", "id": video_id},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30,
        )
        if resp.status_code != 200:
            print(f"verify: videos.list returned {resp.status_code} "
                  f"(read-back only; set result above still stands)")
            return
        items = resp.json().get("items", [])
        if not items:
            print("verify: video not found in videos.list")
            return
        thumbs = items[0]["snippet"].get("thumbnails", {})
        print("verify: video title: "
              f"{items[0]['snippet'].get('title', '?')}")
        print("verify: thumbnail variants now: "
              + ", ".join(sorted(thumbs)))
    except Exception as exc:  # noqa: BLE001 - verification is advisory
        print(f"verify: skipped ({exc})")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--video-id", required=True)
    ap.add_argument("--thumbnail", required=True)
    ap.add_argument("--dry-run", action="store_true",
                    help="validate the file only; no Google calls")
    args = ap.parse_args()

    if not os.path.isfile(args.thumbnail):
        fail(f"thumbnail file not found: {args.thumbnail}")
    size = os.path.getsize(args.thumbnail)
    if size > MAX_BYTES:
        fail(f"thumbnail is {size} bytes, over the {MAX_BYTES} API limit")
    try:
        from PIL import Image  # noqa: PLC0415
        with Image.open(args.thumbnail) as im:
            print(f"thumbnail: {im.size[0]}x{im.size[1]} "
                  f"{im.format} {size} bytes")
            if im.size != (1280, 720):
                print("note: not 1280x720 -- YouTube accepts it, "
                      "but 1280x720 is the house standard")
    except ImportError:
        print(f"thumbnail: {size} bytes (PIL unavailable, size check only)")
    with open(args.thumbnail, "rb") as fh:
        image_bytes = fh.read()

    if args.dry_run:
        print("dry-run OK: file valid, no Google calls made")
        return 0

    client_id = os.environ.get("YT_CLIENT_ID")
    client_secret = os.environ.get("YT_CLIENT_SECRET")
    refresh_token = os.environ.get("YT_REFRESH_TOKEN")
    missing = [n for n, v in (("YT_CLIENT_ID", client_id),
                              ("YT_CLIENT_SECRET", client_secret),
                              ("YT_REFRESH_TOKEN", refresh_token)) if not v]
    if missing:
        fail("missing env vars (GitHub secrets, never printed): "
             + ", ".join(missing))

    print("refreshing access token...")
    access_token = refresh_access_token(client_id, client_secret,
                                        refresh_token)
    print("calling thumbnails.set...")
    resp = set_thumbnail(access_token, args.video_id, image_bytes)
    if resp.status_code != 200:
        fail(f"thumbnails.set failed ({resp.status_code}): "
             f"{resp.text[:500]}")
    body = resp.json()
    print("thumbnails.set OK (200)")
    print(json.dumps(body.get("items", [{}])[0].get("snippet", {}),
                     indent=2)[:800])
    verify(access_token, args.video_id)
    print(f"done: thumbnail set on video {args.video_id}; "
          f"allow a few minutes for it to appear on the watch page")
    return 0


if __name__ == "__main__":
    sys.exit(main())
