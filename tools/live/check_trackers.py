#!/usr/bin/env python3
"""Check that every live stream's tracker is really working, right after kick-off (owner's request, 7 Nov 2026).

Runs every 10 minutes in the "Live tracker check" GitHub Action (.github/workflows/tracker_check.yml).
For every game on a stream (docs/live/settings.json: "pin" and "slots") that ESPN says has started:
  * if the stream shows the scorebuzz.net tracker for that league, open the match page, find the tracker card
    (#trkSlot) and check it really draws: a canvas of a sensible size with varied pixels, and no
    "loading" / "unavailable" message. Two tries, 25 s apart.
  * if it fails, write "sbtrk": 0 on that slot in settings.json: the stream page reads settings every minute and
    switches that game to the built-in tracker (drawn from ESPN data) without a restart.
Results go to docs/live/tracker_checks.json. A game that passed is re-checked every 30 minutes.
Usage: python3 tools/live/check_trackers.py [--dry]
"""
import io, json, os, re, sys, time, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SETTINGS = os.path.join(ROOT, "docs", "live", "settings.json")
LOG = os.path.join(ROOT, "docs", "live", "tracker_checks.json")
DRY = "--dry" in sys.argv

ESPN = {"epl": "soccer/eng.1", "ucl": "soccer/uefa.champions", "uel": "soccer/uefa.europa", "laliga": "soccer/esp.1",
        "seriea": "soccer/ita.1", "bundesliga": "soccer/ger.1", "ligue1": "soccer/fra.1", "mls": "soccer/usa.1",
        "nba": "basketball/nba", "nfl": "football/nfl", "ncaaf": "football/college-football", "nhl": "hockey/nhl",
        "mlb": "baseball/mlb"}
# must match SB_LEAGUE in tools/live/overlay.html (leagues whose streams show the website's tracker)
SITE = {"epl": "football/english-premier-league", "ucl": "football/champions-league", "uel": "football/europa-league",
        "laliga": "football/la-liga", "seriea": "football/serie-a", "bundesliga": "football/bundesliga",
        "ligue1": "football/ligue-1", "mls": "football/mls", "nba": "basketball/nba", "nfl": "american-football/nfl",
        "ncaaf": "american-football/college-football",
        "nhl": "ice-hockey/nhl"}
BAD_TEXT = re.compile(r"loading|unavailable|not available|no data|error", re.I)


def now():
    return datetime.now(timezone.utc)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def slug(s):
    # must match slugify() in tools/live/overlay.html (no accent folding: "CF Montréal" -> "cf-montr-al")
    return re.sub(r"[^a-z0-9]+", "-", str(s or "").lower()).strip("-")


def game(league, event):
    s = get(f"https://site.api.espn.com/apis/site/v2/sports/{ESPN[league]}/summary?event={event}")
    c = s["header"]["competitions"][0]
    t = {x["homeAway"]: x["team"] for x in c["competitors"]}
    name = lambda x: x.get("shortDisplayName") or x.get("name") or x.get("displayName") or "?"
    return {"state": c["status"]["type"]["state"], "detail": c["status"]["type"].get("shortDetail", ""),
            "home": name(t["home"]), "away": name(t["away"])}


def check_site(page, url):
    """True/False + reason. Uses the same page the stream embeds (opened at #trkSlot)."""
    page.goto(url + "#trkSlot", wait_until="domcontentloaded", timeout=60000)
    deadline = time.time() + 25
    info = None
    while time.time() < deadline:
        page.wait_for_timeout(2500)
        info = page.evaluate("""() => { const t = document.getElementById('trkSlot'); if (!t) return null;
            const cv = [...t.querySelectorAll('canvas,svg')].map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; })
                       .filter(([w, h]) => w >= 400 && h >= 250);
            return { text: (t.innerText || '').slice(0, 300), big: cv.length }; }""")
        if info and info["big"] and not BAD_TEXT.search(info["text"]):
            break
    if not info:
        return False, "no tracker card on the match page"
    if BAD_TEXT.search(info["text"]):
        return False, "tracker says: " + BAD_TEXT.search(info["text"]).group(0)
    if not info["big"]:
        return False, "tracker card has no drawing"
    # the drawing must not be blank: varied pixels in a screenshot of the tracker card
    png = page.locator("#trkSlot").screenshot(timeout=20000)
    from PIL import Image, ImageStat
    im = Image.open(io.BytesIO(png)).convert("L").resize((200, 120))
    sd = ImageStat.Stat(im).stddev[0]
    if sd < 12:
        return False, f"tracker drawing looks blank (contrast {sd:.0f})"
    return True, f"ok (contrast {sd:.0f})"


def main():
    st = json.load(open(SETTINGS))
    log = json.load(open(LOG)) if os.path.exists(LOG) else {}
    targets = [(k, v) for k, v in (st.get("slots") or {}).items() if v and v.get("event")]
    if st.get("pin") and st["pin"].get("event"):
        targets.append(("pin", st["pin"]))
    todo = []
    for key, a in targets:
        lg, ev = a.get("league"), str(a.get("event"))
        if lg not in ESPN:
            continue
        rec = log.get(ev, {})
        try:
            g = game(lg, ev)
        except Exception as e:
            print(f"{key} {lg} {ev}: ESPN error {e}")
            continue
        if g["state"] != "in":
            continue  # not started yet / finished
        if lg not in SITE:
            log[ev] = {**rec, "slot": key, "league": lg, "mode": "built-in", "status": "ok", "at": now().isoformat(timespec="seconds")}
            continue
        if a.get("sbtrk") == 0:
            continue  # already switched to the built-in tracker
        last = rec.get("at")
        if rec.get("status") == "ok" and last and (now() - datetime.fromisoformat(last)).total_seconds() < 1800:
            continue
        url = f"https://scorebuzz.net/{SITE[lg]}/{slug(g['home'])}-vs-{slug(g['away'])}-{ev}/"
        todo.append((key, lg, ev, url, g))
    changed = False
    if todo:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.launch()
            page = b.new_page(viewport={"width": 1000, "height": 1100})
            for key, lg, ev, url, g in todo:
                ok, why = False, ""
                for attempt in range(2):
                    try:
                        ok, why = check_site(page, url)
                    except Exception as e:
                        ok, why = False, f"page error: {str(e)[:120]}"
                    if ok:
                        break
                    page.wait_for_timeout(25000)
                print(f"slot {key} {lg} {g['home']} v {g['away']} ({g['detail']}): {'OK' if ok else 'FAIL'} - {why}")
                log[ev] = {"slot": key, "league": lg, "game": f"{g['home']} v {g['away']}", "url": url,
                           "mode": "website" if ok else "built-in (website tracker failed)", "status": "ok" if ok else "switched",
                           "reason": why, "at": now().isoformat(timespec="seconds")}
                if not ok:
                    tgt = st["pin"] if key == "pin" else st["slots"][key]
                    tgt["sbtrk"] = 0
                    changed = True
            b.close()
    # keep the log small: last 300 games
    log = dict(sorted(log.items(), key=lambda kv: kv[1].get("at", ""))[-300:])
    if not DRY:
        json.dump(log, open(LOG, "w"), indent=1)
        if changed:
            json.dump(st, open(SETTINGS, "w"), indent=1, ensure_ascii=False)
            open(SETTINGS, "a").write("\n")
    print(f"checked {len(todo)} stream(s); switched {sum(1 for t in todo if log[t[2]]['status'] == 'switched')}")


if __name__ == "__main__":
    main()
