"""A sample Apple Health export for the demo player (made up, labelled as a sample): the watch's record of the club
games in web/public/data/club.json (some ran past their booking), morning runs with GPS routes, and daily steps,
resting heart rate and sleep. The last week carries more load than the four before it, so the agent has something
to act on. Writes web/public/data/sample/serve_sample_health_export.zip in Apple's export layout.
  python video/sample_health.py
"""
import io
import json
import math
import random
import zipfile
from datetime import date, datetime, timedelta

ROOT = __file__.replace("\\", "/").rsplit("/video/", 1)[0]
club = json.load(open(f"{ROOT}/web/public/data/club.json", encoding="utf-8"))
geo = json.load(open(f"{ROOT}/web/public/data/venues.json", encoding="utf-8"))["map"]["geo"]
rnd = random.Random(7)
TODAY = date(2026, 10, 27)
FIRST = date(2026, 8, 31)
TZ = "+0800"
APPLE = {"badminton": "Badminton", "tennis": "Tennis", "pickleball": "Pickleball", "basketball": "Basketball", "running": "Running"}
# the watch's minutes where they differ from the club's record: Saturday's game with Kenji ran long
WATCH = {"2026-10-24": 132}

stamp = lambda d, hm: f"{d.isoformat()} {hm}:00 {TZ}"
at = lambda d, hm, add=0: (datetime.combine(d, datetime.strptime(hm, "%H:%M").time()) + timedelta(minutes=add)).strftime("%Y-%m-%d %H:%M:%S ") + TZ

workouts, routes = [], {}
for h in club["you"]["history"]:
    d, mins = date.fromisoformat(h["date"]), WATCH.get(h["date"], h["played"])
    workouts.append({"sport": h["sport"], "d": d, "start": h["start"], "min": mins, "hr": rnd.randint(136, 148), "max": rnd.randint(168, 181), "kcal": round(mins * rnd.uniform(7.2, 8.4))})


# morning runs from home, out along the river and back; the last week has three, earlier weeks one
def home():
    a = club["you"]["area"]
    return geo["lat"] - a["y"] * geo["unitKm"] / 110.57, geo["lon"] + a["x"] * geo["unitKm"] / (111.32 * math.cos(math.radians(geo["lat"])))


# the runs follow a real riverside bikeway near home (video/sample_route.json, from OpenStreetMap), out and back
PATH = json.load(open(f"{ROOT}/video/sample_route.json", encoding="utf-8"))["path"]


def run_route(d, mins):
    seg = lambda a, b: math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 101)
    want, legs, pts = mins / 5.8, [], []  # about 5:50 a kilometre
    while sum(seg(a, b) for a, b in zip(legs, legs[1:])) < want:
        legs += PATH[1:] if legs else PATH
        legs += PATH[::-1][1:]
    for a, b in zip(legs, legs[1:]):  # a point every 10 m or so, a few metres of GPS wobble
        k = max(1, round(seg(a, b) / 0.01))
        for i in range(k):
            f = i / k
            pts.append((a[0] + (b[0] - a[0]) * f + rnd.gauss(0, 0.000025), a[1] + (b[1] - a[1]) * f + rnd.gauss(0, 0.000025)))
    tot, acc, out = sum(seg(a, b) for a, b in zip(pts, pts[1:])), 0, [pts[0]]
    for a, b in zip(pts, pts[1:]):
        acc += seg(a, b)
        out.append(b)
        if acc >= want:
            break
    n = len(out)
    t0 = datetime.combine(d, datetime.strptime("06:40", "%H:%M").time())
    pts = "\n".join(f'   <trkpt lon="{b:.6f}" lat="{a:.6f}"><ele>{8 + 2 * math.sin(i / 20):.1f}</ele><time>{(t0 + timedelta(seconds=i * mins * 60 / (n - 1)) - timedelta(hours=8)).strftime("%Y-%m-%dT%H:%M:%SZ")}</time></trkpt>' for i, (a, b) in enumerate(out))
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Sample Watch" xmlns="http://www.topografix.com/GPX/1/1">\n <trk><name>Route {d}</name><trkseg>\n{pts}\n </trkseg></trk>\n</gpx>\n', sum(math.dist(p, q) for p, q in zip(out, out[1:])) * 111


runs = [d for d in (FIRST + timedelta(days=i) for i in range((TODAY - FIRST).days)) if (d.weekday() == 1 and d < date(2026, 10, 19)) or d in (date(2026, 10, 21), date(2026, 10, 23), date(2026, 10, 25))]
for d in runs:
    mins = rnd.randint(40, 50) if d >= date(2026, 10, 19) else rnd.randint(30, 36)
    gpx, dist = run_route(d, mins)
    name = f"route_{d.isoformat()}_6.40am.gpx"
    routes[name] = gpx
    workouts.append({"sport": "running", "d": d, "start": "06:40", "min": mins, "hr": rnd.randint(148, 156), "max": rnd.randint(172, 182), "kcal": round(mins * 10.5), "km": round(dist, 2), "route": name})
# a pick-up basketball game on Sunday
workouts.append({"sport": "basketball", "d": date(2026, 10, 26), "start": "10:00", "min": 60, "hr": 139, "max": 175, "kcal": 520})
workouts.sort(key=lambda w: (w["d"], w["start"]))

rec = []
for i in range((TODAY - FIRST).days):
    d = FIRST + timedelta(days=i)
    busy = any(w["d"] == d for w in workouts)
    for part, hm in ((0.35, "09:00"), (0.4, "13:00"), (0.25, "18:00")):
        steps = round(rnd.randint(6500, 9800) * part * (1.25 if busy else 1))
        rec.append(f' <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Sample iPhone" unit="count" creationDate="{stamp(d, hm)}" startDate="{stamp(d, hm)}" endDate="{at(d, hm, 50)}" value="{steps}"/>')
        rec.append(f' <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Sample Watch" unit="count" creationDate="{stamp(d, hm)}" startDate="{stamp(d, hm)}" endDate="{at(d, hm, 50)}" value="{round(steps * 0.93)}"/>')
    rhr = 57 + (2 if d >= date(2026, 10, 22) else 0) + rnd.choice((-1, 0, 0, 1))
    rec.append(f' <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Sample Watch" unit="count/min" creationDate="{stamp(d, "07:00")}" startDate="{stamp(d, "00:05")}" endDate="{stamp(d, "23:55")}" value="{rhr}"/>')
    rec.append(f' <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Sample Watch" unit="ms" creationDate="{stamp(d, "07:00")}" startDate="{stamp(d, "03:10")}" endDate="{stamp(d, "03:11")}" value="{rnd.randint(52, 66) - (6 if d >= date(2026, 10, 22) else 0)}"/>')
    sleep = rnd.uniform(6.6, 7.8) - (0.5 if d >= date(2026, 10, 22) else 0)
    s0 = datetime.combine(d - timedelta(days=1), datetime.strptime("23:20", "%H:%M").time())
    rec.append(f' <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Sample Watch" creationDate="{stamp(d, "07:10")}" startDate="{s0.strftime("%Y-%m-%d %H:%M:%S ") + TZ}" endDate="{(s0 + timedelta(hours=sleep)).strftime("%Y-%m-%d %H:%M:%S ") + TZ}" value="HKCategoryValueSleepAnalysisAsleepCore"/>')

wx = []
for w in workouts:
    extra = f'\n  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="{stamp(w["d"], w["start"])}" endDate="{at(w["d"], w["start"], w["min"])}" sum="{w["km"]}" unit="km"/>' if w.get("km") else ""
    route = f'\n  <WorkoutRoute sourceName="Sample Watch" creationDate="{at(w["d"], w["start"], w["min"])}" startDate="{stamp(w["d"], w["start"])}" endDate="{at(w["d"], w["start"], w["min"])}">\n   <FileReference path="/workout-routes/{w["route"]}"/>\n  </WorkoutRoute>' if w.get("route") else ""
    wx.append(f''' <Workout workoutActivityType="HKWorkoutActivityType{APPLE[w["sport"]]}" duration="{w["min"]}" durationUnit="min" sourceName="Sample Watch" creationDate="{at(w["d"], w["start"], w["min"])}" startDate="{stamp(w["d"], w["start"])}" endDate="{at(w["d"], w["start"], w["min"])}">
  <MetadataEntry key="HKIndoorWorkout" value="{0 if w["sport"] in ("running", "basketball") else 1}"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="{stamp(w["d"], w["start"])}" endDate="{at(w["d"], w["start"], w["min"])}" average="{w["hr"]}" minimum="92" maximum="{w["max"]}" unit="count/min"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="{stamp(w["d"], w["start"])}" endDate="{at(w["d"], w["start"], w["min"])}" sum="{w["kcal"]}" unit="Cal"/>{extra}{route}
 </Workout>''')

xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ELEMENT HealthData (ExportDate,Me,(Record|Workout)*)>
<!ATTLIST HealthData locale CDATA #REQUIRED>
]>
<!-- SAMPLE DATA for the Serve demo: made up, not a real person's health record -->
<HealthData locale="en_TW">
 <ExportDate value="{stamp(TODAY, "07:30")}"/>
 <Me HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexNotSet"/>
{chr(10).join(rec)}
{chr(10).join(wx)}
</HealthData>
'''
out = f"{ROOT}/web/public/data/sample/serve_sample_health_export.zip"
import os
os.makedirs(os.path.dirname(out), exist_ok=True)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("apple_health_export/export.xml", xml)
    for n, g in routes.items():
        z.writestr(f"apple_health_export/workout-routes/{n}", g)
print(out, len(workouts), "workouts,", len(routes), "routes,", round(os.path.getsize(out) / 1024), "KB")
