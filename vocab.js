/*
 * Vocabulary answer checking (spoken answers).
 * Decides whether what you said matches the expected answer, forgiving
 * small recognition differences: punctuation, capitals, accents, "to"
 * before verbs, articles in English, numbers said as digits, etc.
 */
(function (root) {
  "use strict";

  var EN_NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  var ES_NUM = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce",
    "trece", "catorce", "quince", "dieciseis", "diecisiete", "dieciocho", "diecinueve", "veinte"];
  var EN_CONTRACTIONS = { "i'm": "i am", "you're": "you are", "it's": "it is", "what's": "what is", "don't": "do not",
    "doesn't": "does not", "isn't": "is not", "i'll": "i will", "you've": "you have", "let's": "let us", "where's": "where is",
    "that's": "that is", "can't": "cannot", "won't": "will not", "i've": "i have", "we're": "we are" };
  var ES_ARTICLES = ["el", "la", "los", "las", "un", "una", "unos", "unas"];

  function stripAccents(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function normEn(s) {
    s = String(s || "").toLowerCase().replace(/[’`]/g, "'");
    s = s.replace(/\([^)]*\)/g, " ");
    s = s.replace(/[a-z]+'[a-z]+/g, function (w) { return EN_CONTRACTIONS[w] || w.replace("'", ""); });
    s = s.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    var words = s.split(" ").filter(Boolean).map(function (w) { return /^\d+$/.test(w) && +w <= 20 ? EN_NUM[+w] : w; });
    // leading "to" (verbs) and articles don't matter
    while (words.length > 1 && /^(to|the|a|an|my|your)$/.test(words[0])) words.shift();
    return words.join(" ");
  }
  function normEs(s) {
    s = stripAccents(String(s || "").toLowerCase()).replace(/[^a-zñ0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    return s.split(" ").filter(Boolean).map(function (w) { return /^\d+$/.test(w) && +w <= 20 ? ES_NUM[+w] : w; }).join(" ");
  }

  /* All acceptable English answers: "tomorrow; morning" -> ["tomorrow", "morning"]. */
  function englishAnswers(en) {
    var noParens = String(en || "").replace(/\([^)]*\)/g, " ");
    var parts = noParens.split(/[;,\/]| or /).map(normEn).filter(Boolean);
    var whole = normEn(en);
    if (whole && parts.indexOf(whole) < 0) parts.unshift(whole);
    return parts;
  }

  function lev(a, b) {
    var m = a.length, n = b.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function similarity(a, b) {
    if (!a && !b) return 1;
    return 1 - lev(a, b) / Math.max(a.length, b.length);
  }
  // Share of the answer's words that appear in what was heard (in any order).
  function wordRecall(answer, heard) {
    var aw = answer.split(" "), hw = heard.split(" "), used = {}, hit = 0;
    aw.forEach(function (w) {
      for (var i = 0; i < hw.length; i++) if (!used[i] && (hw[i] === w || (w.length > 5 && similarity(hw[i], w) >= 0.83))) { used[i] = true; hit++; return; }
    });
    return { recall: hit / aw.length, extra: hw.length - hit };
  }
  function close(answer, heard, threshold) {
    if (!answer || !heard) return false;
    if (answer === heard || similarity(answer, heard) >= threshold) return true;
    var r = wordRecall(answer, heard);
    return r.recall >= (answer.split(" ").length <= 2 ? 1 : 0.8) && r.extra <= 3;
  }

  /* Spanish -> English: did you give one of the meanings? */
  function checkEnglish(expectedEn, heard) {
    var h = normEn(heard), answers = englishAnswers(expectedEn);
    var ok = answers.some(function (a) { return close(a, h, 0.8); });
    return { ok: ok, heard: heard, accepted: answers };
  }

  /* English -> Spanish: did you say the Spanish? Articles are checked gently. */
  function checkSpanish(expectedEs, heard) {
    var e = normEs(expectedEs), h = normEs(heard);
    var res = { ok: false, heard: heard, note: "" };
    if (!h) return res;
    if (close(e, h, 0.85)) { res.ok = true; return res; }
    var ew = e.split(" "), hw = h.split(" ");
    if (ES_ARTICLES.indexOf(ew[0]) >= 0 && ew.length > 1) {
      var noun = ew.slice(1).join(" ");
      var heardNoun = ES_ARTICLES.indexOf(hw[0]) >= 0 ? hw.slice(1).join(" ") : h;
      if (close(noun, heardNoun, 0.85)) {
        if (ES_ARTICLES.indexOf(hw[0]) < 0) {
          res.ok = true; res.note = "Good! Learn it with its article: " + expectedEs + ".";
        } else {
          res.ok = false; res.note = "Right word, wrong article: it's " + expectedEs + ".";
        }
      }
    }
    return res;
  }

  var api = { normEn: normEn, normEs: normEs, englishAnswers: englishAnswers, similarity: similarity,
              checkEnglish: checkEnglish, checkSpanish: checkSpanish };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Vocab = api;
})(typeof window !== "undefined" ? window : globalThis);
