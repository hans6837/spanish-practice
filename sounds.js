/*
 * Spanish (Spain) sound guide.
 * Splits Spanish words into sounds, lines them up with Azure's
 * sound-by-sound scores, and explains weak sounds in plain language.
 */
(function (root) {
  "use strict";

  // Each sound category: label shown to you + a simple tip.
  // Each sound: label, a simple tip, and a comparison with French.
  var SOUNDS = {
    rr:    { label: "rolled r",            tip: "Roll it: the tip of your tongue vibrates several times just behind your top teeth (trrr).",
             fr: "Keep the r at the tip of the tongue, not in the throat like the French r. French has no rolled r." },
    r:     { label: "single r",            tip: "One quick flick of the tongue tip behind the top teeth, like the 'tt' in American 'butter'.",
             fr: "Not the French throat r: one light tap of the tongue tip behind the top teeth." },
    j:     { label: "j sound (j, ge, gi)", tip: "A raspy breath from the back of the throat, like 'ch' in German 'Bach'. Stronger than an English h.",
             fr: "Not the French j of 'jour'. It is close to a French throat r, but whispered (no voice)." },
    ny:    { label: "ñ",                   tip: "One smooth sound with the middle of the tongue against the roof of the mouth.",
             fr: "Exactly the French 'gn' in 'montagne' or 'agneau'." },
    th:    { label: "Spain 'th' (z, ce, ci)", tip: "In Spain, z and c before e/i sound like 'th' in English 'think': tongue tip lightly between the teeth.",
             fr: "French has no such sound. Don't say s or f: put the tongue tip between the teeth and blow." },
    zs:    { label: "z / ce / ci (said as s)", tip: "In Mexico and Latin America, z and c before e/i are a clear s.",
             fr: "Like the French s in 'si' (never the z sound of French 'zéro')." },
    dsoft: { label: "soft d",              tip: "Between vowels and at the end of a word the d is very soft, like 'th' in English 'this'.",
             fr: "Much softer than a French d: the tongue barely touches the teeth, air keeps flowing." },
    d:     { label: "d",                   tip: "Tongue tip against the back of the top teeth.",
             fr: "Like the French d." },
    bsoft: { label: "soft b / v",          tip: "b and v are the same sound. Between vowels the lips barely touch: a soft, relaxed b.",
             fr: "Softer than a French b: the lips almost touch but don't close." },
    b:     { label: "b / v",               tip: "b and v are the same sound: both lips together.",
             fr: "Both b and v sound like the French b. Don't touch the lip with your teeth as for a French v." },
    gsoft: { label: "soft g",              tip: "Between vowels the g is soft: the back of the tongue almost touches the roof of the mouth.",
             fr: "Softer than the French g in 'gare': don't close completely." },
    g:     { label: "g",                   tip: "A hard g as in 'go'.",
             fr: "Like the French g in 'gare'." },
    ll:    { label: "ll / y",              tip: "Like 'y' in 'yes', with the tongue a little closer to the roof of the mouth.",
             fr: "Like the French 'y' in 'yeux' or 'ill' in 'fille', a little stronger." },
    ch:    { label: "ch",                  tip: "Like 'ch' in English 'church'.",
             fr: "Like 'tch' in French 'tchèque', not the 'ch' of French 'chat'." },
    ptk:   { label: "p / t / k",           tip: "Crisp, with no puff of air. For t, the tongue touches the back of the top teeth.",
             fr: "Exactly as in French." },
    l:     { label: "l",                   tip: "A clear l, tongue tip behind the top teeth.",
             fr: "Like the French l." },
    s:     { label: "s",                   tip: "Always a clear hissing s, never a buzzing z, even between vowels.",
             fr: "Always like French 'ss' in 'poisson'. Spanish 'rosa' has no z sound, unlike French 'rose'." },
    a:     { label: "vowel a",             tip: "An open 'a'. Short and pure.",
             fr: "Like the French a in 'patte'." },
    e:     { label: "vowel e",             tip: "Short and pure, never sliding into 'ei'.",
             fr: "Like the French 'é' in 'été'. Every e is pronounced, even at the end of a word." },
    i:     { label: "vowel i",             tip: "Short and clear.",
             fr: "Like the French i." },
    o:     { label: "vowel o",             tip: "A pure 'o'. Don't slide into 'ou' as in English 'go'.",
             fr: "Like the French o in 'mot'." },
    u:     { label: "vowel u",             tip: "Rounded lips, tongue back.",
             fr: "Like the French 'ou' in 'fou', never the French u of 'tu'." },
    w:     { label: "u-glide (ue, ua...)", tip: "The u glides quickly into the next vowel: 'due-le' sounds like 'dweh-leh'.",
             fr: "Like the French 'ou' gliding into the next vowel, as in 'oui'." },
    y:     { label: "i-glide (ie, ia...)", tip: "The i glides quickly into the next vowel: 'pie' sounds like 'pyeh'.",
             fr: "Like the French i gliding into the next vowel, as in 'pied'." },
    other: { label: "consonant",           tip: "", fr: "" },
  };
  // Extra French warnings that depend on where the sound is in the word.
  var NASAL_FR = "Don't make it nasal as in French 'an, on, en, un': say a clear vowel, then a real n or m.";
  var FINAL_E_FR = "Pronounce this final e clearly (like é). In French it would be silent.";
  // Accent: "es-ES" (Spain) or "es-MX" (Mexico).
  var accent = "es-ES";
  var MX_TIPS = { j: { tip: "A soft breath from the throat, like a strong English h in 'house' (lighter than in Spain).",
                       fr: "Not the French j of 'jour': a breathy h sound from the throat." } };
  function soundInfo(key) {
    var base = SOUNDS[key] || SOUNDS.other;
    return accent === "es-MX" && MX_TIPS[key] ? Object.assign({}, base, MX_TIPS[key]) : base;
  }
  function setAccent(a) { accent = a === "es-MX" ? "es-MX" : "es-ES"; }

  var VOWELS = "aeiouáéíóúü";
  var STRIP = { "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u" };

  function isVowel(c) { return !!c && VOWELS.indexOf(c) >= 0; }
  function base(c) { return STRIP[c] || c; }
  function stripAccents(s) {
    return s.toLowerCase().replace(/[áéíóúü]/g, function (c) { return STRIP[c]; }).replace(/ñ/g, "n");
  }
  function cleanWord(w) {
    return w.toLowerCase().replace(/[^a-záéíóúüñ]/g, "");
  }
  function tokenize(sentence) {
    return sentence.split(/\s+/).map(function (t) { return { text: t, clean: cleanWord(t) }; })
      .filter(function (t) { return t.clean.length > 0; });
  }

  /*
   * Split one word into sounds.
   * prevChar: last letter of the previous word ("" if the word starts the phrase),
   * which decides soft/hard b, d, g and rolled r at the start of a word.
   */
  function wordToSounds(word, prevChar) {
    var w = cleanWord(word), units = [], i = 0;
    prevChar = prevChar || "";
    function add(key, start, len) { units.push({ key: key, start: start, end: start + len, spelling: w.substr(start, len) }); }
    function prev(k) { return k > 0 ? w[k - 1] : prevChar; }

    while (i < w.length) {
      var c = w[i], n = w[i + 1] || "", n2 = w[i + 2] || "";
      var p = prev(i);
      var afterPause = (i === 0 && !prevChar);
      if (isVowel(c)) {
        var b = base(c);
        // unstressed i / u next to another vowel = glide
        if ((c === "i" || c === "u" || c === "ü") && (isVowel(n) && base(n) !== b)) { add(b === "i" ? "y" : "w", i, 1); }
        else { add(b, i, 1); }
        i += 1; continue;
      }
      switch (c) {
        case "h": i += 1; continue; // silent
        case "c":
          if (n === "h") { add("ch", i, 2); i += 2; continue; }
          if (n === "e" || n === "i" || n === "é" || n === "í") { add(accent === "es-MX" ? "zs" : "th", i, 1); i += 1; continue; }
          add("ptk", i, 1); i += 1; continue;
        case "q":
          add("ptk", i, n === "u" ? 2 : 1); i += (n === "u" ? 2 : 1); continue;
        case "z": add(accent === "es-MX" ? "zs" : "th", i, 1); i += 1; continue;
        case "g":
          if ("eiéí".indexOf(n) >= 0 && n) { add("j", i, 1); i += 1; continue; }
          var gKey = (afterPause || p === "n") ? "g" : "gsoft";
          if (n === "u" && "eiéí".indexOf(n2) >= 0 && n2) { add(gKey, i, 2); i += 2; continue; } // gue, gui: u silent
          add(gKey, i, 1); i += 1; continue;
        case "j": add("j", i, 1); i += 1; continue;
        case "ñ": add("ny", i, 1); i += 1; continue;
        case "l":
          if (n === "l") { add("ll", i, 2); i += 2; continue; }
          add("l", i, 1); i += 1; continue;
        case "y":
          if (isVowel(n)) { add("ll", i, 1); } else { add("i", i, 1); }
          i += 1; continue;
        case "r":
          if (n === "r") { add("rr", i, 2); i += 2; continue; }
          if (i === 0 || p === "n" || p === "l" || p === "s") { add("rr", i, 1); } else { add("r", i, 1); }
          i += 1; continue;
        case "d":
          add((afterPause || p === "n" || p === "l") ? "d" : "dsoft", i, 1); i += 1; continue;
        case "b": case "v":
          add((afterPause || p === "m" || p === "n") ? "b" : "bsoft", i, 1); i += 1; continue;
        case "p": case "t": case "k": add("ptk", i, 1); i += 1; continue;
        case "x": add("ptk", i, 1); units.push({ key: "s", start: i, end: i + 1, spelling: "x" }); i += 1; continue;
        case "s": add("s", i, 1); i += 1; continue;
        default: add("other", i, 1); i += 1; continue;
      }
    }
    units.forEach(function (u, k) {
      u.label = SOUNDS[u.key].label;
      // French-speaker traps: nasal vowel before n/m + consonant (or end), silent final e
      var after = w[u.end], after2 = w[u.end + 1];
      if ("aeiou".indexOf(u.key) >= 0 && (after === "n" || after === "m") && (!after2 || !isVowel(after2))) u.nasal = true;
      if (u.key === "e" && u.end === w.length && w.length > 2) u.finalE = true;
    });
    return units;
  }

  function sentenceToSounds(sentence) {
    var prevChar = "";
    return tokenize(sentence).map(function (t) {
      var units = wordToSounds(t.clean, prevChar);
      prevChar = t.clean[t.clean.length - 1];
      // a comma / question mark etc. is a pause
      if (/[,.;:¿?¡!]$/.test(t.text)) prevChar = "";
      return { text: t.text, clean: t.clean, units: units };
    });
  }

  function score(obj) {
    return obj && obj.PronunciationAssessment ? obj.PronunciationAssessment.AccuracyScore : (obj && obj.AccuracyScore);
  }

  /* Give each of our sounds a score from Azure's phoneme scores. */
  function scoreUnits(units, azureWord) {
    var phonemes = (azureWord && azureWord.Phonemes) || [];
    var wordScore = score(azureWord);
    var n = phonemes.length, m = units.length;
    var exact = n === m && n > 0;
    // When the counts differ, give each Azure phoneme to the sound whose
    // relative position contains the phoneme's middle.
    var buckets = units.map(function () { return []; });
    if (!exact && n > 0) {
      for (var k = 0; k < n; k++) buckets[Math.min(m - 1, Math.floor((k + 0.5) * m / n))].push(score(phonemes[k]));
    }
    return units.map(function (u, j) {
      var s;
      if (exact) {
        s = score(phonemes[j]);
      } else if (n > 0) {
        s = buckets[j].length ? Math.min.apply(null, buckets[j])
                              : score(phonemes[Math.min(n - 1, Math.floor((j + 0.5) * n / m))]);
      } else {
        s = wordScore;
      }
      return Object.assign({}, u, { score: Math.round(s == null ? 0 : s), exact: exact });
    });
  }

  function colourFor(s) { return s >= 80 ? "good" : s >= 60 ? "ok" : "bad"; }

  /*
   * Turn Azure's JSON result into everything the screen needs.
   * result: parsed JSON from Azure (has NBest[0]).
   */
  function analyse(referenceText, result) {
    var best = (result && result.NBest && result.NBest[0]) || {};
    var pa = best.PronunciationAssessment || {};
    var refWords = sentenceToSounds(referenceText);
    var azureWords = (best.Words || []);
    var display = [], inserted = [], soundsForStats = [];

    // Match Azure's words to the sentence, in order.
    var ai = 0;
    refWords.forEach(function (rw) {
      var match = null;
      for (var k = ai; k < azureWords.length; k++) {
        var aw = azureWords[k];
        var et = aw.PronunciationAssessment && aw.PronunciationAssessment.ErrorType;
        if (et === "Insertion") { if (inserted.indexOf(aw.Word) < 0) inserted.push(aw.Word); continue; }
        if (stripAccents(cleanWord(aw.Word)) === stripAccents(rw.clean)) { match = aw; ai = k + 1; break; }
      }
      var entry = { text: rw.text, clean: rw.clean };
      if (!match) {
        entry.score = 0; entry.error = "Omission"; entry.colour = "bad";
        entry.problems = [{ message: "This word was not heard. Make sure you say every word." }];
        display.push(entry);
        return;
      }
      var errorType = (match.PronunciationAssessment && match.PronunciationAssessment.ErrorType) || "None";
      entry.score = Math.round(score(match) || 0);
      entry.error = errorType;
      entry.colour = colourFor(entry.score);
      if (errorType === "Omission") { entry.colour = "bad"; entry.score = 0; }
      var units = scoreUnits(rw.units, match);
      units.forEach(function (u) {
        if (u.key !== "other" && errorType !== "Omission") soundsForStats.push({ key: u.key, label: u.label, score: u.score });
      });
      entry.units = units;
      entry.problems = [];
      if (errorType === "Omission") {
        entry.problems.push({ message: "This word was skipped. Make sure you say every word." });
      } else if (entry.score < 80) {
        var weak = units.filter(function (u) { return u.score < 75 && u.key !== "other"; })
          .sort(function (a, b) { return a.score - b.score; }).slice(0, 2);
        if (!weak.length) {
          var lowest = units.slice().sort(function (a, b) { return a.score - b.score; })[0];
          if (lowest) weak = [lowest];
        }
        weak.forEach(function (u) {
          var info = soundInfo(u.key);
          entry.problems.push({ spelling: u.spelling, start: u.start, end: u.end, key: u.key, label: u.label,
            score: u.score, tip: info.tip, french: u.nasal ? NASAL_FR : u.finalE ? FINAL_E_FR : info.fr });
        });
        if (rw.clean.indexOf("h") >= 0 && entry.score < 70) {
          entry.problems.push({ message: "Remember: the h in Spanish is always silent." });
        }
      }
      display.push(entry);
    });

    // Any extra words not already noted
    azureWords.forEach(function (aw) {
      var et = aw.PronunciationAssessment && aw.PronunciationAssessment.ErrorType;
      if (et === "Insertion" && inserted.indexOf(aw.Word) < 0) inserted.push(aw.Word);
    });

    return {
      overall: Math.round(pa.PronScore != null ? pa.PronScore : 0),
      accuracy: Math.round(pa.AccuracyScore || 0),
      fluency: Math.round(pa.FluencyScore || 0),
      completeness: Math.round(pa.CompletenessScore || 0),
      heard: best.Display || result.DisplayText || "",
      words: display,
      inserted: inserted,
      sounds: soundsForStats,
    };
  }

  var api = { SOUNDS: SOUNDS, soundInfo: soundInfo, setAccent: setAccent, wordToSounds: wordToSounds, sentenceToSounds: sentenceToSounds,
              analyse: analyse, colourFor: colourFor, cleanWord: cleanWord };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SpanishSounds = api;
})(typeof window !== "undefined" ? window : globalThis);
