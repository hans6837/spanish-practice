/*
 * Course reader.
 * Reads spanish_course.json and turns it into: levels -> units -> lesson,
 * example phrases and practice items. It accepts several ways of naming
 * things (English or Spanish field names), so small changes in the file's
 * layout don't break the app.
 *
 * Your progress is linked to the Spanish text of each item (not to its
 * position in the file), so you can replace spanish_course.json with a new
 * version at any time without losing anything.
 */
(function (root) {
  "use strict";

  var COURSE_FILE = "spanish_course.json";

  // Same Spanish text => same progress. Ignores capitals, punctuation and
  // extra spaces, but keeps accents (sí and si are pronounced differently).
  function itemKey(es) {
    return String(es || "").normalize("NFC").toLowerCase()
      .replace(/[¿?¡!.,;:"“”«»()\[\]…—–\-\/]/g, " ").replace(/\s+/g, " ").trim();
  }

  function pick(obj, names) {
    if (!obj || typeof obj !== "object") return undefined;
    for (var i = 0; i < names.length; i++) if (obj[names[i]] != null && obj[names[i]] !== "") return obj[names[i]];
    return undefined;
  }
  function text(v) {
    if (v == null) return "";
    if (Array.isArray(v)) return v.map(text).filter(Boolean).join("\n\n");
    if (typeof v === "object") return text(pick(v, ["text", "content", "body", "es", "en"]));
    return String(v).trim();
  }
  function list(v) {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "object") return Object.keys(v).map(function (k) { return v[k]; });
    return [v];
  }
  function slug(s) {
    return itemKey(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }

  var F = {
    levels: ["levels", "niveles", "course", "curso"],
    units: ["units", "unidades", "lessons", "lecciones", "modules", "modulos", "módulos", "chapters"],
    title: ["title", "titulo", "título", "name", "nombre", "heading"],
    subtitle: ["subtitle", "english", "en", "description", "descripcion", "descripción", "label"],
    cefr: ["cefr", "mcer", "level_code", "levelCode"],
    id: ["id", "code", "codigo", "código"],
    lesson: ["lesson", "leccion", "lección", "lesson_text", "lessonText", "explanation", "explicacion", "explicación", "intro", "text", "theory", "content"],
    examples: ["examples", "example_phrases", "examplePhrases", "ejemplos", "frases", "phrases_examples"],
    items: ["items", "practice", "practica", "práctica", "exercises", "ejercicios", "words", "phrases", "palabras", "vocabulary", "vocabulario"],
    es: ["spanish", "es", "español", "espanol", "text", "phrase", "frase", "word", "palabra", "target"],
    en: ["english", "en", "ingles", "inglés", "translation", "traduccion", "traducción"],
    fr: ["french", "fr", "frances", "francés", "français"],
    tip: ["tip", "pronunciation", "pronunciacion", "pronunciación", "pron", "hint", "note", "nota", "consejo"],
  };

  function readEntry(raw) {
    if (typeof raw === "string") return { es: raw.trim(), en: "", fr: "", tip: "" };
    var es = text(pick(raw, F.es));
    return { es: es, en: text(pick(raw, F.en)), fr: text(pick(raw, F.fr)), tip: text(pick(raw, F.tip)) };
  }

  /* Turn the raw JSON into the app's course structure. */
  function normalize(raw) {
    var report = { levels: 0, units: 0, items: 0, examples: 0, skipped: [], duplicates: 0 };
    var levelsRaw = Array.isArray(raw) ? raw : list(pick(raw, F.levels));
    if (!levelsRaw.length && raw && pick(raw, F.units)) levelsRaw = [raw];
    var seenUnitIds = {};
    var levels = levelsRaw.map(function (lv, li) {
      var lTitle = text(pick(lv, F.title)) || ("Level " + (li + 1));
      var unitsRaw = list(pick(lv, F.units));
      var units = unitsRaw.map(function (u, ui) {
        var uTitle = text(pick(u, F.title)) || ("Unit " + (ui + 1));
        var fileId = text(pick(u, F.id));
        var id = fileId ? "U-" + slug(fileId) : "L" + (li + 1) + "-" + (slug(uTitle) || "u" + (ui + 1));
        while (seenUnitIds[id]) id += "-" + (ui + 1);
        seenUnitIds[id] = true;
        var examples = list(pick(u, F.examples)).map(readEntry).filter(function (e) { return e.es; });
        var seenKeys = {};
        var items = [];
        list(pick(u, F.items)).forEach(function (r, ii) {
          var e = readEntry(r);
          if (!e.es) { report.skipped.push(lTitle + " › " + uTitle + " › item " + (ii + 1) + " has no Spanish text"); return; }
          e.key = itemKey(e.es);
          if (seenKeys[e.key]) { report.duplicates++; return; }
          seenKeys[e.key] = true;
          items.push(e);
        });
        report.units++; report.items += items.length; report.examples += examples.length;
        return { id: id, title: uTitle, subtitle: text(pick(u, F.subtitle)), lesson: text(pick(u, F.lesson)), examples: examples, items: items,
                 levelIndex: li, unitIndex: ui };
      });
      report.levels++;
      var sub = [text(pick(lv, F.subtitle)), text(pick(lv, F.cefr))].filter(Boolean).join(" · ");
      return { index: li, number: li + 1, title: lTitle, subtitle: sub, units: units };
    });
    // Example phrases given as plain text: borrow the translation and tip
    // from the same phrase if it is also a practice item somewhere.
    var byKey = {};
    levels.forEach(function (l) { l.units.forEach(function (u) { u.items.forEach(function (it) { if (!byKey[it.key]) byKey[it.key] = it; }); }); });
    levels.forEach(function (l) { l.units.forEach(function (u) { u.examples.forEach(function (e) {
      var m = byKey[itemKey(e.es)] || byKey[itemKey("el " + e.es)] || byKey[itemKey("la " + e.es)] || byKey[itemKey("los " + e.es)] || byKey[itemKey("las " + e.es)];
      if (m) { e.en = e.en || m.en; e.fr = e.fr || m.fr; e.tip = e.tip || m.tip; }
    }); }); });
    return { levels: levels, report: report };
  }

  /* The old word decks, shown as one level if no course file is found. */
  function fromDecks(decks) {
    return normalize({ levels: [{ title: "Practice decks", units: decks.decks.map(function (d) {
      return { title: d, items: decks.items.filter(function (i) { return i.deck === d; }).map(function (i) { return { spanish: i.es, english: i.en, french: i.fr }; }) };
    }) }] });
  }

  /* Fetch the course file. Always asks for the latest version. */
  function load(fallbackDecks) {
    return fetch(COURSE_FILE, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("not found (" + r.status + ")");
      return r.text();
    }).then(function (t) {
      var raw;
      try { raw = JSON.parse(t.replace(/^﻿/, "")); }
      catch (e) { var err = new Error(COURSE_FILE + " has a formatting mistake: " + e.message); err.badJson = true; throw err; }
      var c = normalize(raw);
      if (!c.report.items) throw new Error(COURSE_FILE + " was read, but no practice items were found in it.");
      c.source = COURSE_FILE;
      return c;
    }).catch(function (e) {
      if (!fallbackDecks) throw e;
      var c = fromDecks(fallbackDecks);
      c.source = "built-in decks";
      c.problem = e.message;
      return c;
    });
  }

  function allUnits(course) {
    var out = [];
    course.levels.forEach(function (l) { l.units.forEach(function (u) { out.push(u); }); });
    return out;
  }

  var api = { itemKey: itemKey, normalize: normalize, fromDecks: fromDecks, load: load, allUnits: allUnits, FILE: COURSE_FILE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Course = api;
})(typeof window !== "undefined" ? window : globalThis);
