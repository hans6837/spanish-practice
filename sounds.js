/*
 * Spanish (Spain) sound guide.
 * Splits Spanish words into sounds, lines them up with Azure's
 * sound-by-sound scores, and explains weak sounds in plain language.
 */
(function (root) {
  "use strict";

  // Each sound category: label shown to you + a simple tip.
  var SOUNDS = {
    rr:    { label: "rolled r",            tip: "Roll it: the tip of your tongue vibrates several times just behind your top teeth (trrr). Not the French throat r." },
    r:     { label: "single r",            tip: "One quick flick of the tongue tip behind the top teeth, like the 'tt' in American 'butter'. Not the French throat r." },
    j:     { label: "j sound (j, ge, gi)", tip: "A raspy breath from the back of the throat, like 'ch' in Scottish 'loch' or German 'Bach'. Stronger than an English h." },
    ny:    { label: "ñ",                   tip: "Like 'gn' in French 'montagne': one smooth sound with the middle of the tongue on the roof of the mouth." },
    th:    { label: "Spain 'th' (z, ce, ci)", tip: "In Spain, z and c before e/i sound like 'th' in English 'think': tongue tip lightly between the teeth." },
    dsoft: { label: "soft d",              tip: "Between vowels and at the end of a word the d is very soft, like 'th' in English 'this'. The tongue barely touches the teeth." },
    d:     { label: "d",                   tip: "Tongue tip against the back of the top teeth, like French d (not on the gum ridge like English)." },
    bsoft: { label: "soft b / v",          tip: "b and v are the same sound. Between vowels the lips barely touch: a soft, relaxed b." },
    b:     { label: "b / v",               tip: "b and v are the same sound: both lips together, like a French b. Never the English v (teeth on lip)." },
    gsoft: { label: "soft g",              tip: "Between vowels the g is soft: the back of the tongue almost touches the roof of the mouth." },
    g:     { label: "g",                   tip: "A hard g as in 'go'." },
    ll:    { label: "ll / y",              tip: "Like 'y' in 'yes', with the tongue a little closer to the roof of the mouth." },
    ch:    { label: "ch",                  tip: "Like 'ch' in English 'church' (not the French 'ch')." },
    ptk:   { label: "p / t / k",           tip: "No puff of air: say it crisply, as in French. For t, the tongue touches the back of the top teeth." },
    l:     { label: "l",                   tip: "A clear l like in French, tongue tip behind the top teeth." },
    s:     { label: "s",                   tip: "Always a clear hissing s, never a buzzing z, even between vowels." },
    a:     { label: "vowel a",             tip: "An open 'a' as in French 'patte'. Short and pure." },
    e:     { label: "vowel e",             tip: "Like French 'é': short and pure, never sliding into 'ei'." },
    i:     { label: "vowel i",             tip: "Like French 'i': short and clear." },
    o:     { label: "vowel o",             tip: "A pure 'o' like French 'mot'. Don't slide into 'ou' as in English 'go'." },
    u:     { label: "vowel u",             tip: "Like French 'ou' (never the French 'u')." },
    w:     { label: "u-glide (ue, ua...)", tip: "The u glides quickly into the next vowel, like the 'w' in 'well': 'due-le' sounds like 'dweh-leh'." },
    y:     { label: "i-glide (ie, ia...)", tip: "The i glides quickly into the next vowel, like the 'y' in 'yes': 'pie' sounds like 'pyeh'." },
    other: { label: "consonant",           tip: "" },
  };

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
          if (n === "e" || n === "i" || n === "é" || n === "í") { add("th", i, 1); i += 1; continue; }
          add("ptk", i, 1); i += 1; continue;
        case "q":
          add("ptk", i, n === "u" ? 2 : 1); i += (n === "u" ? 2 : 1); continue;
        case "z": add("th", i, 1); i += 1; continue;
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
    units.forEach(function (u) { u.label = SOUNDS[u.key].label; });
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
          entry.problems.push({ spelling: u.spelling, start: u.start, end: u.end, key: u.key, label: u.label,
            score: u.score, tip: SOUNDS[u.key].tip });
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

  var api = { SOUNDS: SOUNDS, wordToSounds: wordToSounds, sentenceToSounds: sentenceToSounds,
              analyse: analyse, colourFor: colourFor, cleanWord: cleanWord };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SpanishSounds = api;
})(typeof window !== "undefined" ? window : globalThis);
