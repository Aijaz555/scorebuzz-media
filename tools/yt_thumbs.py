#!/usr/bin/env python3
"""Upload our designed thumbnails to YouTube through the YouTube Data API (thumbnails.set).

Runs in the "YouTube thumbnails" GitHub Action (.github/workflows/thumbs.yml) with the repo secrets
YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (OAuth scope https://www.googleapis.com/auth/youtube).

How it works:
  1. Lists the channel's latest uploads (title + video id).
  2. Reads shorts/<day>/shorts.json and videos/<day>/videos.json for the days given (default: today and
     yesterday, PKT) and matches each entry's YouTube title to an upload.
  3. Uploads <id>.thumb.jpg for every match that isn't in thumbs/uploaded.json yet, and logs it there.
Videos that haven't been published yet simply don't match; a later run picks them up.
Quota: thumbnails.set = 50 units, list calls = 1 unit each (free quota is 10,000/day).
Usage: python3 tools/yt_thumbs.py [YYYY-MM-DD ...]   (env DRY_RUN=1 to only print the matches)
"""
import json, os, re, sys, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, "thumbs", "uploaded.json")
DRY = os.environ.get("DRY_RUN") == "1"


def http(method, url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {url.split('?')[0]} -> HTTP {e.code}: {body[:800]}")


def access_token():
    data = urllib.parse.urlencode({
        "client_id": os.environ["YT_CLIENT_ID"].strip(),
        "client_secret": os.environ["YT_CLIENT_SECRET"].strip(),
        "refresh_token": os.environ["YT_REFRESH_TOKEN"].strip(),
        "grant_type": "refresh_token",
    }).encode()
    try:
        return http("POST", "https://oauth2.googleapis.com/token", data,
                    {"Content-Type": "application/x-www-form-urlencoded"})["access_token"]
    except RuntimeError:
        # Safe hints only (a client ID is public; never print the secret or the token itself)
        cid, sec, rt = (os.environ[k].strip() for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"))
        print("Login failed. Check:")
        print("  YT_CLIENT_ID      =", cid, "(should end in .apps.googleusercontent.com)")
        print("  YT_CLIENT_SECRET  : length", len(sec), "starts with", repr(sec[:7]), "(usually 'GOCSPX-')")
        print("  YT_REFRESH_TOKEN  : length", len(rt), "starts with", repr(rt[:3]), "(usually '1//')")
        raise


def norm(t):
    return re.sub(r"[^a-z0-9]+", "", (t or "").lower())


def main():
    pkt = datetime.now(timezone.utc) + timedelta(hours=5)
    days = sys.argv[1:] or [pkt.strftime("%Y-%m-%d"), (pkt - timedelta(days=1)).strftime("%Y-%m-%d")]
    tok = access_token()
    H = {"Authorization": f"Bearer {tok}"}
    api = "https://www.googleapis.com/youtube/v3/"

    ch = http("GET", api + "channels?part=contentDetails,snippet&mine=true", headers=H)
    if not ch.get("items"):
        sys.exit("No channel found for this login. Re-create the refresh token signed in as the ScoreBuzz channel.")
    print("Channel:", ch["items"][0]["snippet"]["title"])
    uploads = ch["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    vids, page = [], ""
    for _ in range(2):  # latest 100 uploads
        r = http("GET", api + f"playlistItems?part=snippet&maxResults=50&playlistId={uploads}" + (f"&pageToken={page}" if page else ""), headers=H)
        vids += [(it["snippet"]["resourceId"]["videoId"], it["snippet"]["title"]) for it in r.get("items", [])]
        page = r.get("nextPageToken")
        if not page:
            break
    by_title = {}
    for vid, title in vids:
        by_title.setdefault(norm(title), vid)  # newest first

    log = json.load(open(LOG)) if os.path.exists(LOG) else []
    done = {x["videoId"] for x in log}
    failed = 0
    for day in days:
        for sub, fname in (("shorts", "shorts.json"), ("videos", "videos.json")):
            f = os.path.join(ROOT, sub, day, fname)
            if not os.path.exists(f):
                continue
            for e in json.load(open(f)):
                thumb = os.path.join(ROOT, sub, day, e["id"] + ".thumb.jpg")
                vid = by_title.get(norm(e.get("title")))
                if not vid or not os.path.exists(thumb):
                    continue
                if vid in done:
                    continue
                print(f"{day} {e['id']} -> https://youtu.be/{vid}")
                if DRY:
                    continue
                try:
                    with open(thumb, "rb") as fh:
                        img = fh.read()
                    http("POST", f"https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={vid}&uploadType=media",
                         img, {**H, "Content-Type": "image/jpeg"})
                    log.append({"date": day, "id": e["id"], "videoId": vid,
                                "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
                    done.add(vid)
                    print("   thumbnail set")
                except Exception as ex:  # keep going with the rest
                    failed += 1
                    print("   FAILED:", ex)
    if not DRY:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        json.dump(log, open(LOG, "w"), indent=1)
    if failed:
        sys.exit(f"{failed} thumbnail upload(s) failed")


if __name__ == "__main__":
    main()
