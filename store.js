/*
 * Storage for Spanish Pronunciation Practice.
 * Everything (your Azure key, your results, your own words) is kept only in
 * this browser on this device (localStorage). Nothing is sent to GitHub.
 *
 * Progress is linked to the Spanish text of each item (Course.itemKey), so
 * it survives course updates and items that appear in several places.
 */
(function (root) {
  "use strict";

  var STORAGE_KEY = "spanishPractice.v1"; // same slot as before; data inside is version 2
  var MINUTE = 60 * 1000, DAY = 24 * 60 * MINUTE;
  // Review gaps by level. Level 0 = "needs work": back after a few other items.
  var INTERVALS = [3 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
  var MAX_ATTEMPTS = 20000;
  var GOOD = 80;          // a score of 80+ counts as a "good day" for the item
  var GOOD_DAYS = 2;      // an item is learned after good scores on 2 different days
  var UNIT_LEARNED = 0.8; // a unit is learned when 80% of its items are learned

  var itemKey = (root.Course && root.Course.itemKey) || function (es) {
    return String(es || "").normalize("NFC").toLowerCase().replace(/[¿?¡!.,;:"“”«»()\[\]…—–\-\/]/g, " ").replace(/\s+/g, " ").trim();
  };

  function emptyData() {
    return { version: 2,
             settings: { key: "", region: "", voice: "", speed: "-15%", accent: "es-ES", newPerDay: 10 },
             myItems: [], items: {}, attempts: [] };
  }
  function dayKey(t) {
    var d = new Date(t);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  /* Convert data saved by the first version (word decks, progress by deck id). */
  function migrate(d, legacy) {
    if (d.version === 2) return d;
    var idToText = {};
    ((legacy && legacy.items) || []).forEach(function (it) { idToText[it.id] = it.es; });
    (d.myItems || []).forEach(function (it) { idToText[it.id] = it.es; });
    var out = emptyData();
    out.settings = Object.assign(out.settings, d.settings || {});
    out.myItems = d.myItems || [];
    var keyOf = function (id) { return idToText[id] != null ? itemKey(idToText[id]) : null; };
    out.attempts = (d.attempts || []).map(function (a) {
      var k = a.k || keyOf(a.id);
      if (!k) return null;
      var n = Object.assign({}, a, { k: k }); delete n.id; return n;
    }).filter(Boolean);
    Object.keys(d.review || {}).forEach(function (id) {
      var k = keyOf(id); if (!k) return;
      var r = d.review[id], cur = out.items[k];
      if (!cur || (r.last || 0) > (cur.last || 0)) out.items[k] = Object.assign({}, r);
    });
    rebuildFromAttempts(out);
    return out;
  }
  /* Fill in good days, best score and first-practice day from the attempt history. */
  function rebuildFromAttempts(d) {
    d.attempts.forEach(function (a) {
      var e = d.items[a.k] || (d.items[a.k] = { level: 0, seen: 0, due: a.t + INTERVALS[0], last: a.t, last_score: a.o });
      e.goodDays = e.goodDays || [];
      var day = dayKey(a.t);
      if (a.o >= GOOD && e.goodDays.indexOf(day) < 0) e.goodDays.push(day);
      e.best = Math.max(e.best || 0, a.o);
      if (!e.introduced || day < e.introduced) e.introduced = day;
    });
  }

  function Store(storage, legacyDecks) {
    this.storage = storage;
    this.legacy = legacyDecks || { decks: [], items: [] };
    this.texts = {};   // item key -> { es, en, fr, tip, unitId, unitTitle }
    this.data = this.load();
  }

  Store.prototype.load = function () {
    var d = emptyData();
    try {
      var raw = this.storage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        var wasOld = parsed.version !== 2;
        d = migrate(parsed, this.legacy);
        d.settings = Object.assign(emptyData().settings, d.settings || {});
        if (wasOld) {
          try { this.storage.setItem(STORAGE_KEY + ".backup-before-course", raw); } catch (e) {}
          this.data = d; this.save();
        }
      }
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return d;
  };

  Store.prototype.save = function () {
    if (this.data.attempts.length > MAX_ATTEMPTS) this.data.attempts = this.data.attempts.slice(-MAX_ATTEMPTS);
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data)); return true; }
    catch (e) { return false; }
  };

  // ------------------------------------------------------------ settings
  Store.keyLooksValid = function (key) {
    key = String(key || "").trim();
    return key.length >= 32 && /^[A-Za-z0-9]+$/.test(key);
  };
  Store.cleanRegion = function (region) { return String(region || "").trim().toLowerCase().replace(/\s+/g, ""); };
  Store.prototype.settings = function () { return this.data.settings; };
  Store.prototype.saveSettings = function (patch) {
    var s = this.data.settings;
    if (patch.key !== undefined) {
      if (!Store.keyLooksValid(patch.key)) return "That doesn't look like an Azure key. It should be a long code of letters and numbers (KEY 1 on the 'Keys and Endpoint' page).";
      s.key = patch.key.trim();
    }
    if (patch.region !== undefined) {
      var r = Store.cleanRegion(patch.region);
      if (!/^[a-z0-9-]+$/.test(r)) return "Please enter the region, for example westeurope.";
      s.region = r;
    }
    if (patch.newPerDay !== undefined) {
      var n = parseInt(patch.newPerDay, 10);
      if (!(n >= 1 && n <= 100)) return "New items per day must be a number from 1 to 100.";
      s.newPerDay = n;
    }
    if (patch.accent === "es-ES" || patch.accent === "es-MX") s.accent = patch.accent;
    if (patch.voice !== undefined) s.voice = patch.voice;
    if (patch.speed) s.speed = patch.speed;
    this.save();
    return null;
  };
  Store.prototype.isConfigured = function () {
    var s = this.data.settings;
    return Store.keyLooksValid(s.key) && !!s.region;
  };

  // ------------------------------------------------------------ course & own words
  /* Tell the store which items exist (for names in lists). */
  Store.prototype.setCourse = function (course) {
    var texts = {};
    course.levels.forEach(function (l) {
      l.units.forEach(function (u) {
        u.items.forEach(function (it) {
          if (!texts[it.key]) texts[it.key] = { es: it.es, en: it.en, fr: it.fr, tip: it.tip, unitId: u.id, unitTitle: u.title, levelIndex: l.index };
        });
      });
    });
    this.texts = texts;
  };
  /* Your own words, as one extra level ("My words"), one unit per deck name. */
  Store.prototype.myWordsLevel = function (index) {
    var byDeck = {}, order = [];
    this.data.myItems.forEach(function (it) {
      var d = it.deck || "My words";
      if (!byDeck[d]) { byDeck[d] = []; order.push(d); }
      byDeck[d].push({ es: it.es, en: it.en || "", fr: it.fr || "", tip: it.tip || "", key: itemKey(it.es), id: it.id, custom: true });
    });
    return { index: index, number: index + 1, title: "My words", subtitle: "Your own words and sentences", custom: true,
      units: order.map(function (d, ui) {
        return { id: "MY-" + ui + "-" + itemKey(d).replace(/[^a-z0-9]+/g, "-"), title: d, lesson: "", examples: [], items: byDeck[d],
                 levelIndex: index, unitIndex: ui, custom: true };
      }) };
  };
  Store.prototype.addItem = function (es, en, fr, deck) {
    es = String(es || "").trim();
    if (!es) return { error: "Please type the Spanish text." };
    var item = { id: "my-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                 deck: String(deck || "").trim() || "My words", es: es,
                 en: String(en || "").trim(), fr: String(fr || "").trim() };
    this.data.myItems.push(item);
    this.save();
    return { item: item };
  };
  Store.prototype.deleteItem = function (id) {
    this.data.myItems = this.data.myItems.filter(function (it) { return it.id !== id; });
    this.save();
  };

  // ------------------------------------------------------------ item & unit progress
  Store.prototype.item = function (key) { return this.data.items[key] || null; };
  Store.prototype.isItemLearned = function (key) {
    var e = this.data.items[key];
    return !!(e && e.goodDays && e.goodDays.length >= GOOD_DAYS);
  };
  Store.prototype.unitProgress = function (unit, now) {
    now = now || Date.now();
    var self = this, total = unit.items.length, learned = 0, practised = 0, due = 0, fresh = 0;
    unit.items.forEach(function (it) {
      var e = self.data.items[it.key];
      if (!e) { fresh++; return; }
      practised++;
      if (self.isItemLearned(it.key)) learned++;
      if (e.due <= now) due++;
    });
    var ratio = total ? learned / total : 0;
    return { total: total, learned: learned, practised: practised, due: due, fresh: fresh,
             pct: Math.round(ratio * 100), isLearned: total > 0 && ratio >= UNIT_LEARNED - 1e-9 };
  };
  Store.prototype.newToday = function (now) {
    var today = dayKey(now || Date.now()), items = this.data.items;
    return Object.keys(items).filter(function (k) { return items[k].introduced === today; }).length;
  };
  Store.prototype.dueKeys = function (keys, now) {
    var items = this.data.items; now = now || Date.now();
    return keys.filter(function (k) { return items[k] && items[k].due <= now; });
  };

  // ------------------------------------------------------------ review scheduling
  Store.prototype.updateReview = function (key, score, now) {
    var e = this.data.items[key] || { level: 0, seen: 0, goodDays: [] };
    var level = e.level || 0;
    if (score >= 85) level = Math.min(level + 1, INTERVALS.length - 1);
    else if (score >= 65) level = level > 1 ? Math.max(1, level - 1) : 1;
    else level = 0;
    e.level = level; e.seen = (e.seen || 0) + 1; e.last = now; e.last_score = Math.round(score);
    e.due = now + INTERVALS[level];
    this.data.items[key] = e;
    return e;
  };

  /*
   * Pick the next item among `keys`.
   * Order: items due for review (weakest first), then new items (up to the
   * daily limit, unless opts.moreNew), then extra practice (soonest due).
   * Returns {key, why}; why = "review" | "new" | "extra" | "limit" | "empty".
   */
  Store.prototype.chooseNext = function (keys, opts) {
    opts = opts || {};
    var items = this.data.items, now = opts.now || Date.now();
    var exclude = opts.exclude || [], shown = opts.shown || [];
    if (!keys.length) return { key: null, why: "empty" };
    var cands = keys.filter(function (k) { return exclude.indexOf(k) < 0; });
    if (!cands.length) cands = keys.slice();
    var due = cands.filter(function (k) { return items[k] && items[k].due <= now; });
    if (due.length) {
      due.sort(function (a, b) { return (items[a].level - items[b].level) || (items[a].due - items[b].due); });
      return { key: due[0], why: "review" };
    }
    var fresh = cands.filter(function (k) { return !items[k]; });
    var unshown = fresh.filter(function (k) { return shown.indexOf(k) < 0; });
    var newLeft = Math.max(0, this.data.settings.newPerDay - this.newToday(now));
    if (fresh.length && (newLeft > 0 || opts.moreNew)) return { key: (unshown.length ? unshown : fresh)[0], why: "new" };
    if (fresh.length && !opts.extraOk) return { key: null, why: "limit", freshLeft: fresh.length };
    var seen = cands.filter(function (k) { return items[k]; });
    if (!seen.length) return { key: null, why: "limit", freshLeft: fresh.length };
    seen.sort(function (a, b) { return items[a].due - items[b].due; });
    return { key: seen[0], why: "extra" };
  };

  // ------------------------------------------------------------ attempts
  /* a: {key, first, overall, accuracy, fluency, completeness, sounds} */
  Store.prototype.recordAttempt = function (a, now) {
    now = now || Date.now();
    var rec = { t: now, k: a.key, f: a.first ? 1 : 0, o: Math.round(a.overall), a: Math.round(a.accuracy || 0),
                fl: Math.round(a.fluency || 0), c: Math.round(a.completeness || 0),
                s: (a.sounds || []).map(function (s) { return [s.key, Math.round(s.score)]; }) };
    this.data.attempts.push(rec);
    var review = null;
    if (a.first && a.key) review = this.updateReview(a.key, a.overall, now);
    var e = this.data.items[a.key];
    if (!e) e = this.data.items[a.key] = { level: 0, seen: 0, due: now + INTERVALS[0], last: now, last_score: rec.o };
    e.goodDays = e.goodDays || [];
    var day = dayKey(now);
    if (!e.introduced) e.introduced = day;
    if (rec.o >= GOOD && e.goodDays.indexOf(day) < 0) { e.goodDays.push(day); if (e.goodDays.length > 10) e.goodDays.shift(); }
    e.best = Math.max(e.best || 0, rec.o);
    var ok = this.save();
    return { review: review, saved: ok, learned: this.isItemLearned(a.key) };
  };

  /* Average score per sound over your recent recordings (weakest first). */
  Store.prototype.weakSounds = function (soundLabels, minCount) {
    var sounds = {};
    this.data.attempts.slice(-600).forEach(function (a) {
      (a.s || []).forEach(function (s) {
        var e = sounds[s[0]] || (sounds[s[0]] = { key: s[0], sum: 0, n: 0 });
        e.sum += s[1]; e.n += 1;
      });
    });
    return Object.keys(sounds).map(function (k) { return sounds[k]; }).filter(function (e) { return e.n >= (minCount || 2); })
      .map(function (e) { return { key: e.key, label: (soundLabels && soundLabels[e.key]) || e.key, avg: Math.round(e.sum / e.n * 10) / 10, count: e.n }; })
      .sort(function (a, b) { return a.avg - b.avg; });
  };

  Store.prototype.progress = function (soundLabels, allKeys, now) {
    now = now || Date.now();
    var attempts = this.data.attempts, items = this.data.items, texts = this.texts, self = this;
    var days = {};
    attempts.forEach(function (a) {
      if (!a.f) return;
      var k = dayKey(a.t), d = days[k] || (days[k] = { day: k, sum: 0, n: 0 });
      d.sum += a.o; d.n += 1;
    });
    var daily = Object.keys(days).sort().map(function (k) {
      return { day: k, avg: Math.round(days[k].sum / days[k].n * 10) / 10, count: days[k].n };
    }).slice(-60);
    var inCourse = {}; (allKeys || Object.keys(texts)).forEach(function (k) { inCourse[k] = true; });
    var weak = Object.keys(items).filter(function (k) { return inCourse[k] && items[k].last_score != null; }).map(function (k) {
      var r = items[k], t = texts[k] || {};
      return { key: k, es: t.es || k, unit: t.unitTitle || "", last_score: r.last_score, level: r.level };
    }).sort(function (a, b) { return a.last_score - b.last_score; });
    var keys = Object.keys(items).filter(function (k) { return inCourse[k]; });
    return {
      total_attempts: attempts.length,
      items_practised: keys.length,
      items_total: Object.keys(inCourse).length,
      items_learned: keys.filter(function (k) { return self.isItemLearned(k); }).length,
      due_now: keys.filter(function (k) { return items[k].due <= now; }).length,
      daily: daily, sounds: this.weakSounds(soundLabels), weak_items: weak.slice(0, 15),
    };
  };

  // ------------------------------------------------------------ backup
  Store.prototype.exportJSON = function (includeKey) {
    var copy = JSON.parse(JSON.stringify(this.data));
    if (!includeKey) copy.settings.key = "";
    copy.exported = new Date().toISOString();
    return JSON.stringify(copy);
  };
  Store.prototype.importJSON = function (text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { return "This file is not a backup from this program."; }
    if (!d || !Array.isArray(d.attempts) || (typeof d.review !== "object" && typeof d.items !== "object")) return "This file is not a backup from this program.";
    var keep = this.data.settings;
    d = migrate(d, this.legacy);
    this.data = Object.assign(emptyData(), d);
    this.data.settings = Object.assign(emptyData().settings, d.settings || {});
    if (!this.data.settings.key) { this.data.settings.key = keep.key; this.data.settings.region = this.data.settings.region || keep.region; }
    delete this.data.exported;
    this.save();
    return null;
  };

  Store.STORAGE_KEY = STORAGE_KEY;
  Store.INTERVALS = INTERVALS;
  Store.dayKey = dayKey;
  Store.itemKey = itemKey;
  if (typeof module !== "undefined" && module.exports) module.exports = Store;
  root.PracticeStore = Store;
})(typeof window !== "undefined" ? window : globalThis);
