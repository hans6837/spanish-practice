// Run with: node tests/test_vocab.js
const assert = require("assert");
const V = require("../vocab.js");
const yes = (exp, heard) => assert.ok(V.checkEnglish(exp, heard).ok, `EN should accept "${heard}" for "${exp}"`);
const no = (exp, heard) => assert.ok(!V.checkEnglish(exp, heard).ok, `EN should reject "${heard}" for "${exp}"`);
// Spanish -> English (what the recogniser might hear)
yes("house", "House.");
yes("to stretch, straighten", "stretch");
yes("to stretch, straighten", "To straighten.");
yes("tomorrow; morning", "Morning.");
yes("to be (identity, job)", "To be.");
yes("I'm tired.", "I am tired.");
yes("I'm tired.", "I'm tired");
yes("Where does it hurt?", "Where does it hurt?");
yes("Where does it hurt?", "where does it hurts");
yes("From 0 to 10, how much does it hurt?", "From zero to ten how much does it hurt");
yes("Do three sets of ten repetitions.", "Do 3 sets of 10 repetitions.");
yes("cart; car (Latin America)", "a car");
yes("you (formal)", "You.");
yes("knee", "The knee.");
yes("It's normal to feel a little discomfort.", "It is normal to feel a bit of discomfort");
no("house", "horse and cart");
no("knee", "elbow");
no("Where does it hurt?", "When did it start?");
no("to bend", "to send a letter to my friend");
no("I'm tired.", "");
// English -> Spanish
const es = (exp, heard) => V.checkSpanish(exp, heard);
assert.ok(es("la cabeza", "La cabeza.").ok);
assert.ok(es("¿Dónde le duele?", "Donde le duele").ok);
assert.ok(es("el ejercicio", "el ejercicio").ok);
assert.ok(es("Haga tres series de diez repeticiones.", "Haga 3 series de 10 repeticiones").ok);
let r = es("la cabeza", "Cabeza.");
assert.ok(r.ok && /article/.test(r.note), "missing article accepted with a reminder");
r = es("la mano", "El mano.");
assert.ok(!r.ok && /wrong article/.test(r.note), "wrong article is not accepted");
assert.ok(!es("la rodilla", "el tobillo").ok);
assert.ok(!es("pero", "perro").ok, "pero and perro are different words");
assert.ok(!es("Doble la rodilla.", "").ok);
console.log("ALL VOCAB ANSWER TESTS PASSED");

// ---- Vocabulary scheduling (store.js)
const Store = require("../store.js");
function mem() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; }
const MIN = 60000, DAY = 86400000, now = new Date(2026, 10, 12, 9).getTime();
const s = new Store(mem(), { decks: [], items: [] });
const keys = ["casa", "mesa", "oso"];
assert.strictEqual(s.chooseVocab(keys, "mixed", { now }).card, null, "nothing to test before practising");
s.recordAttempt({ key: "casa", first: true, overall: 90 }, now);
s.recordAttempt({ key: "mesa", first: true, overall: 70 }, now);
assert.deepStrictEqual(s.vocabPool(keys), ["casa", "mesa"], "only practised items");
let st = s.vocabStats(keys, "mixed", now);
assert.deepStrictEqual([st.pool, st.due, st.fresh], [2, 0, 2], "two new Spanish->English cards");
r = s.chooseVocab(keys, "mixed", { now });
assert.deepStrictEqual(r, { card: { key: "casa", dir: "es-en" }, why: "new" });
s.recordVocab("casa", "es-en", true, now);               // right -> 10 minutes
assert.strictEqual(s.vocabCard("casa", "es-en").due, now + 10 * MIN);
assert.ok(s.vocabCards(keys, "mixed").some(c => c.key === "casa" && c.dir === "en-es"), "English->Spanish unlocked after a right answer");
s.recordVocab("mesa", "es-en", false, now);              // wrong -> 1 minute
assert.strictEqual(s.vocabCard("mesa", "es-en").due, now + MIN);
assert.ok(!s.vocabCards(keys, "mixed").some(c => c.key === "mesa" && c.dir === "en-es"), "not unlocked after a wrong answer");
r = s.chooseVocab(keys, "mixed", { now: now + 2 * MIN });
assert.deepStrictEqual(r, { card: { key: "mesa", dir: "es-en" }, why: "review" }, "wrong answer comes back first");
r = s.chooseVocab(keys, "mixed", { now: now + 2 * MIN, exclude: ["es-en|mesa"] });
assert.deepStrictEqual(r, { card: { key: "casa", dir: "en-es" }, why: "new" });
// right answers space out: 10 min, 1 day, 3 days ...
s.recordVocab("casa", "es-en", true, now + 11 * MIN);
assert.strictEqual(s.vocabCard("casa", "es-en").due, now + 11 * MIN + DAY);
s.recordVocab("casa", "es-en", true, now + 2 * DAY);
assert.strictEqual(s.vocabCard("casa", "es-en").level, 3);
assert.strictEqual(s.vocabStats(keys, "mixed", now + 2 * DAY).knownEsEn, 1);
// "I was right": undo a wrong mark
const before = JSON.parse(JSON.stringify(s.vocabCard("mesa", "es-en")));
s.recordVocab("mesa", "es-en", false, now + 3 * MIN);
s.correctLastVocab("mesa", "es-en", before, now + 3 * MIN);
assert.strictEqual(s.vocabCard("mesa", "es-en").right, 1);
assert.strictEqual(s.vocabCard("mesa", "es-en").wrong, 1, "the corrected wrong answer is removed");
// modes
assert.ok(s.vocabCards(keys, "en-es").every(c => c.dir === "en-es"));
assert.ok(s.vocabCards(keys, "es-en").every(c => c.dir === "es-en"));
st = s.vocabStats(keys, "mixed", now + 2 * DAY);
assert.ok(st.week > 0 && st.weekAccuracy > 0);
// vocabulary survives reloading and backups
const s2 = new Store(mem(), { decks: [], items: [] });
assert.strictEqual(s2.importJSON(s.exportJSON(false)), null);
assert.strictEqual(s2.vocabCard("casa", "es-en").level, 3);
console.log("ALL VOCAB SCHEDULE TESTS PASSED");

// ---- Difficult words are remembered
{
  const s3 = new Store(mem(), { decks: [], items: [] });
  const t0 = new Date(2026, 10, 13, 9).getTime(), H = 3600000;
  ["perro", "pero", "casa"].forEach(k => s3.recordAttempt({ key: k, first: true, overall: 90 }, t0));
  const ks = ["perro", "pero", "casa"];
  s3.recordVocab("casa", "es-en", true, t0);
  s3.recordVocab("perro", "es-en", false, t0);              // missed -> 2 points
  assert.strictEqual(Store.struggle(s3.vocabCard("perro", "es-en")), 2);
  assert.deepStrictEqual(s3.difficultCards(ks).map(c => c.key), ["perro"]);
  // right answers on later tests: comes back within a day, not 3 days
  s3.recordVocab("perro", "es-en", true, t0 + H);            // 1 point left
  s3.recordVocab("perro", "es-en", true, t0 + 2 * H);        // level 2 -> normally 1 day
  s3.recordVocab("perro", "es-en", true, t0 + DAY);          // 0 points: no longer difficult
  assert.strictEqual(Store.struggle(s3.vocabCard("perro", "es-en")), 0);
  assert.deepStrictEqual(s3.difficultCards(ks), []);
  s3.recordVocab("pero", "es-en", false, t0);                // missed once
  s3.recordVocab("pero", "es-en", true, t0 + H);
  for (let i = 0; i < 4; i++) s3.recordVocab("pero", "es-en", i === 0 ? true : true, t0 + (i + 2) * DAY);
  // while difficult, a right answer never waits more than a day
  const s4 = new Store(mem(), { decks: [], items: [] });
  s4.recordAttempt({ key: "x", first: true, overall: 90 }, t0);
  for (let i = 0; i < 4; i++) s4.recordVocab("x", "es-en", true, t0 + i * 10 * DAY);   // level 4 -> 7 days
  s4.recordVocab("x", "es-en", false, t0 + 50 * DAY);
  s4.recordVocab("x", "es-en", true, t0 + 50 * DAY + 2 * 60000);
  const cx = s4.vocabCard("x", "es-en");
  assert.ok(cx.due - cx.last <= DAY, "difficult word comes back within a day");
  // right word but weak pronunciation adds a point
  s4.recordVocab("x", "en-es", true, t0, { weakPron: true });
  assert.strictEqual(Store.struggle(s4.vocabCard("x", "en-es")), 1);
  // cards saved before this feature: difficulty worked out from their history
  assert.strictEqual(Store.struggle({ wrong: 2, right: 1 }), 3);
  assert.strictEqual(Store.struggle({ wrong: 1, right: 5 }), 0);
  assert.strictEqual(s3.vocabStats(ks, "mixed", t0).difficult, 0);
  console.log("ALL DIFFICULT-WORD TESTS PASSED");
}
