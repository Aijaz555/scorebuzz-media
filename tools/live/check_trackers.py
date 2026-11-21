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
# football player photos for docs/live/soccer.html (owner 9 Nov 2026): ESPN has almost no football headshots, but the scorebuzz.net
# match page shows each starter with a photo (/img/p/<site id>.png). The stream page can't read that page (no CORS), so this
# script copies the line-ups' jersey -> photo id into this file, which the stream page reads from raw GitHub.
PHOTOS = os.path.join(ROOT, "docs", "live", "player_photos.json")
SOCCER = {"epl", "ucl", "uel", "unl", "bra", "laliga", "seriea", "bundesliga", "ligue1", "mls"}
DRY = "--dry" in sys.argv

ESPN = {"epl": "soccer/eng.1", "ucl": "soccer/uefa.champions", "uel": "soccer/uefa.europa", "unl": "soccer/uefa.nations", "bra": "soccer/bra.1", "laliga": "soccer/esp.1",
        "seriea": "soccer/ita.1", "bundesliga": "soccer/ger.1", "ligue1": "soccer/fra.1", "mls": "soccer/usa.1",
        "nba": "basketball/nba", "nfl": "football/nfl", "ncaaf": "football/college-football", "nhl": "hockey/nhl",
        "mlb": "baseball/mlb"}
# must match SB_LEAGUE in tools/live/overlay.html (leagues whose streams show the website's tracker)
SITE = {"epl": "football/english-premier-league", "ucl": "football/champions-league", "uel": "football/europa-league", "unl": "football/uefa-nations-league", "bra": "football/brasileirao",
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


SB = {}
def short_names(league):
    """team id -> ESPN shortDisplayName (the site's URL slug: "Pacers", "Ole Miss", "Philadelphia"); the summary lacks it"""
    if league not in SB:
        try:
            j = get(f"https://site.api.espn.com/apis/site/v2/sports/{ESPN[league]}/scoreboard" + ("?groups=80&limit=100" if league == "ncaaf" else ""))
            SB[league] = {str(x["team"]["id"]): x["team"].get("shortDisplayName") for e in j.get("events", []) for x in e["competitions"][0]["competitors"]}
        except Exception:
            SB[league] = {}
    return SB[league]


def game(league, event):
    s = get(f"https://site.api.espn.com/apis/site/v2/sports/{ESPN[league]}/summary?event={event}")
    c = s["header"]["competitions"][0]
    t = {x["homeAway"]: x["team"] for x in c["competitors"]}
    sn = short_names(league)
    name = lambda x: sn.get(str(x.get("id"))) or x.get("shortDisplayName") or x.get("name") or x.get("displayName") or "?"
    return {"state": c["status"]["type"]["state"], "detail": c["status"]["type"].get("shortDetail", ""),
            "home": name(t["home"]), "away": name(t["away"])}


FEED = {}
def lineup_photos_feed(event):
    """{team name: {jersey: {"id", "name"}}} (starters + bench) from the site's live match feed.
    Since ~21 Nov 2026 the match page draws its line-ups in the browser from /api/live/md-<fx>.json (photo = /img/p/<id>.png);
    /api/live/football.json maps the page URL (…-<ESPN event>/) to that fx id."""
    if "football" not in FEED:
        FEED["football"] = get("https://scorebuzz.net/api/live/football.json")
    fx = None
    def walk(o):
        nonlocal fx
        if fx:
            return
        if isinstance(o, dict):
            if str(o.get("u", "")).rstrip("/").endswith(f"-{event}") and o.get("fx"):
                fx = str(o["fx"]); return
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(FEED["football"])
    if not fx:
        return {}
    md = get(f"https://scorebuzz.net/api/live/md-{fx}.json")
    out = {}
    for side in ("h", "a"):
        t = md.get(side) or {}
        ps = {}
        for p in (t.get("xi") or []) + (t.get("bench") or []):
            n, pid = str(p.get("number") or "").strip(), str(p.get("id") or "").strip()
            if n and pid.isdigit() and n not in ps:
                ps[n] = {"id": pid, "name": p.get("name", "")}
        if ps and t.get("name"):
            out[t["name"]] = ps
    return out


def lineup_photos_rendered(url):
    """{team name: {jersey: {"id", "name"}}} read from the match page's line-up pitch after the browser has drawn it.
    The feed often has empty player ids (Serie A, Ligue 1); the page then matches names to photos itself, so read the result."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        try:
            page = b.new_page(viewport={"width": 1000, "height": 1100})
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            rows = []
            for _ in range(8):
                page.wait_for_timeout(2500)
                rows = page.evaluate("""() => { const P = document.querySelector('[data-mp="pitch"] .mp-pitch'); if (!P) return [];
                    const tn = (s) => (P.querySelector('.fm.' + s + ' .fmn') || {}).textContent || '';
                    return [...P.querySelectorAll('.mp-pl')].map((e) => { const im = e.querySelector('img[src*="/img/p/"]');
                      const a = e.querySelector('a[href*="/player/"]'); const j = (e.querySelector('.jn') || {}).textContent || '';
                      return { team: e.classList.contains('sd-a') ? tn('r') : tn('l'), jersey: j.trim(),
                               id: im ? (im.getAttribute('src').match(/\\/img\\/p\\/(\\d+)/) || [])[1] : null,
                               name: im ? im.alt : (a ? a.textContent : '') }; }); }""")
                if sum(1 for r in rows if r["id"]) >= 11:
                    break
        finally:
            b.close()
    out = {}
    for r in rows:
        if r["id"] and r["jersey"].isdigit() and r["team"].strip():
            out.setdefault(r["team"].strip(), {}).setdefault(r["jersey"], {"id": r["id"], "name": r["name"]})
    return out


def lineup_photos(url, event=None):
    """{team name: {jersey: {"id", "name"}}}: the site's live line-up feed first, then the drawn page, else the old line-up cards."""
    best = {}
    if event:
        try:
            best = lineup_photos_feed(event)
        except Exception as e:
            print(f"{event}: line-up feed error {str(e)[:80]}")
        if sum(len(v) for v in best.values()) >= 30:
            return best
        try:
            got = lineup_photos_rendered(url)
            if sum(len(v) for v in got.values()) > sum(len(v) for v in best.values()):
                best = got
        except Exception as e:
            print(f"{event}: line-up page error {str(e)[:80]}")
        if best:
            return best
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8", "replace")
    out = {}
    for blk in re.split(r"<div class='card'><h3", html)[1:]:
        m = re.match(r"[^>]*>([^<]+?)\s*<span class='meta'>", blk)
        if not m:
            continue
        ps = {}
        for title, pid in re.findall(r'title="([^"]+)"><img class="pph" src="/img/p/(\d+)\.png"', blk):
            jm = re.match(r"(\d+)\s+(.+?)\s+\u2014", title)
            if jm:
                ps[jm.group(1)] = {"id": pid, "name": jm.group(2)}
        if ps:
            out[m.group(1).strip()] = ps
    return out


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
    photos = json.load(open(PHOTOS)) if os.path.exists(PHOTOS) else {}
    photos_changed = False
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
        if lg in SOCCER and lg in SITE and g["state"] in ("pre", "in"):
            have = photos.get(ev, {}).get("teams", {})
            if sum(len(v) for v in have.values()) < 30:  # line-ups come out about an hour before kick-off (starters + bench now)
                try:
                    got = lineup_photos(f"https://scorebuzz.net/{SITE[lg]}/{slug(g['home'])}-vs-{slug(g['away'])}-{ev}/", ev)
                    if got and got != have:
                        photos[ev] = {"at": now().isoformat(timespec="seconds"), "teams": got}
                        photos_changed = True
                except Exception as e:
                    print(f"{key} {lg} {ev}: photos error {str(e)[:80]}")
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
        if photos_changed:
            photos = dict(sorted(photos.items(), key=lambda kv: kv[1].get("at", ""))[-200:])
            json.dump(photos, open(PHOTOS, "w"), indent=1, ensure_ascii=False)
        if changed:
            json.dump(st, open(SETTINGS, "w"), indent=1, ensure_ascii=False)
            open(SETTINGS, "a").write("\n")
    print(f"checked {len(todo)} stream(s); switched {sum(1 for t in todo if log[t[2]]['status'] == 'switched')}")


if __name__ == "__main__":
    main()
