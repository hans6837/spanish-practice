// Run with: node tests/test_store.js
const assert = require("assert");
const fs = require("fs");
const Course = require("../course.js");
const Store = require("../store.js");
function mem(init) { const m = Object.assign({}, init); return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; }
const DAY = 86400000, MIN = 60000;
const legacy = { decks: ["Body & clinic"], items: [
  { id: "clinic-08", deck: "Body & clinic", es: "la rodilla" }, { id: "clinic-12", deck: "Body & clinic", es: "¿Dónde le duele?" },
  { id: "basics-01", deck: "Basics", es: "Hola" } ] };

// ---- 1. Migration of data saved by the old version (decks, progress by deck id)
const t0 = new Date(2026, 10, 9, 10).getTime();          // 9 Nov, 10:00
const old = { version: 1, settings: { key: "0123456789abcdef0123456789abcdef", region: "westeurope", voice: "es-ES-ElviraNeural", speed: "-15%" },
  myItems: [{ id: "my-x", deck: "Anatomy", es: "el fémur", en: "femur", fr: "le fémur" }],
  review: { "clinic-08": { level: 1, seen: 2, last: t0 + DAY, last_score: 86, due: t0 + 2 * DAY }, "clinic-12": { level: 0, seen: 1, last: t0, last_score: 50, due: t0 + 3 * MIN } },
  attempts: [
    { t: t0, id: "clinic-08", f: 1, o: 82, a: 80, fl: 90, c: 100, s: [["rr", 40]] },
    { t: t0 + DAY, id: "clinic-08", f: 1, o: 86, a: 85, fl: 90, c: 100, s: [["rr", 60]] },
    { t: t0, id: "clinic-12", f: 1, o: 50, a: 50, fl: 60, c: 100, s: [] },
    { t: t0, id: "unknown-id", f: 1, o: 50 } ] };
const storage = mem({ [Store.STORAGE_KEY]: JSON.stringify(old) });
let s = new Store(storage, legacy);
assert.strictEqual(s.data.version, 2);
assert.ok(storage._m[Store.STORAGE_KEY + ".backup-before-course"], "old data kept as a safety copy");
assert.strictEqual(s.data.attempts.length, 3, "attempts of unknown items dropped");
const rod = Course.itemKey("la rodilla");
assert.deepStrictEqual(s.item(rod).goodDays.sort(), [Store.dayKey(t0), Store.dayKey(t0 + DAY)]);
assert.ok(s.isItemLearned(rod), "82 and 86 on two different days = learned");
assert.ok(!s.isItemLearned(Course.itemKey("¿Dónde le duele?")));
assert.strictEqual(s.settings().key, "0123456789abcdef0123456789abcdef");
assert.strictEqual(s.settings().newPerDay, 10);
assert.strictEqual(s.settings().accent, "es-ES");

// ---- 2. Course text matches old progress (punctuation/capitals ignored)
const course = Course.normalize({ levels: [{ title: "Clinic", units: [{ title: "Knee", items: [
  { spanish: "La rodilla.", english: "the knee" }, { spanish: "¿DÓNDE le duele?" }, { spanish: "el tobillo" }, { spanish: "la cadera" }, { spanish: "el codo" } ] }] }] });
s.setCourse(course);
const unit = course.levels[0].units[0];
let p = s.unitProgress(unit, t0 + DAY);
assert.deepStrictEqual([p.learned, p.total, p.pct, p.isLearned], [1, 5, 20, false]);

// ---- 3. Learned rule: 80+ on two different days; unit learned at 80%
const day3 = t0 + 2 * DAY;
["el tobillo", "la cadera"].forEach(es => {
  s.recordAttempt({ key: Course.itemKey(es), first: true, overall: 90 }, day3);
  s.recordAttempt({ key: Course.itemKey(es), first: false, overall: 95 }, day3 + MIN);    // same day: still one good day
});
assert.ok(!s.isItemLearned(Course.itemKey("el tobillo")), "two good scores on the same day are not enough");
["el tobillo", "la cadera", "¿Dónde le duele?"].forEach(es => s.recordAttempt({ key: Course.itemKey(es), first: true, overall: 88 }, day3 + DAY));
s.recordAttempt({ key: Course.itemKey("¿Dónde le duele?"), first: true, overall: 81 }, day3 + 2 * DAY);
p = s.unitProgress(unit, day3 + 2 * DAY);
assert.deepStrictEqual([p.learned, p.pct, p.isLearned], [4, 80, true], JSON.stringify(p));

// ---- 4. Spaced repetition and new items per day
const s2 = new Store(mem(), legacy);
s2.saveSettings({ newPerDay: 2 });
const keys = ["a", "b", "c", "d"];
const now = new Date(2026, 10, 11, 9).getTime();
assert.deepStrictEqual(s2.chooseNext(keys, { now }), { key: "a", why: "new" });
s2.recordAttempt({ key: "a", first: true, overall: 40 }, now);          // bad -> back in 3 minutes
s2.recordAttempt({ key: "b", first: true, overall: 95 }, now);          // good -> tomorrow
assert.strictEqual(s2.item("a").due, now + 3 * MIN);
assert.strictEqual(s2.item("b").due, now + DAY);
assert.strictEqual(s2.newToday(now), 2);
let r = s2.chooseNext(keys, { now: now + MIN, exclude: ["b"] });
assert.strictEqual(r.why, "limit", "daily limit of 2 new items reached");
assert.strictEqual(r.freshLeft, 2);
assert.deepStrictEqual(s2.chooseNext(keys, { now: now + MIN, moreNew: true }), { key: "c", why: "new" });
assert.deepStrictEqual(s2.chooseNext(keys, { now: now + MIN, extraOk: true }), { key: "a", why: "extra" });
assert.deepStrictEqual(s2.chooseNext(keys, { now: now + 4 * MIN }), { key: "a", why: "review" }, "bad item comes back first");
assert.deepStrictEqual(s2.chooseNext(keys, { now: now + DAY + MIN }), { key: "a", why: "review" }, "weakest due item first");
assert.strictEqual(s2.chooseNext(keys, { now: now + DAY + MIN, exclude: ["a"] }).key, "b");
assert.strictEqual(s2.newToday(now + DAY), 0, "new-item count resets the next day");
assert.ok(s2.saveSettings({ newPerDay: 0 }));
assert.strictEqual(s2.saveSettings({ accent: "es-MX", newPerDay: "15" }), null);
assert.deepStrictEqual([s2.settings().accent, s2.settings().newPerDay], ["es-MX", 15]);

// ---- 5. Replacing the course file keeps progress (matched by text)
const courseV2 = Course.normalize({ levels: [{ title: "New level", units: [{ title: "Renamed unit", items: [{ spanish: "el codo" }, { spanish: "la rodilla" }] }] }] });
s = new Store(storage, legacy);                 // reopen the app
s.setCourse(courseV2);
assert.ok(s.isItemLearned(rod), "progress still there after a course update");
assert.strictEqual(s.unitProgress(courseV2.levels[0].units[0]).learned, 1);

// ---- 6. My words, backup/restore, weak sounds
assert.strictEqual(s.myWordsLevel(6).units[0].title, "Anatomy");
assert.strictEqual(s.myWordsLevel(6).units[0].items[0].key, "el fémur");
const backup = s.exportJSON(false);
assert.ok(!backup.includes("0123456789abcdef"));
const s3 = new Store(mem(), legacy);
s3.saveSettings({ key: "ffffffffffffffffffffffffffffffff", region: "francecentral" });
assert.strictEqual(s3.importJSON(backup), null);
assert.strictEqual(s3.settings().key, "ffffffffffffffffffffffffffffffff");
assert.ok(s3.isItemLearned(rod));
assert.strictEqual(s3.importJSON(JSON.stringify(old)), null, "old-style backups can still be restored");
assert.ok(s3.isItemLearned(rod));
assert.ok(s3.importJSON("nonsense"));
assert.strictEqual(s.weakSounds({ rr: "rolled r" })[0].label, "rolled r");
console.log("ALL STORE TESTS PASSED");
