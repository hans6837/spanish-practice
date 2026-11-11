// Run with: node tests/test_sounds.js
const S = require("../sounds.js");
const assert = require("assert");
const show = (s) => S.sentenceToSounds(s).map(w => w.clean + "=" + w.units.map(u => u.spelling + ":" + u.key).join(" ")).join(" | ");

const cases = {
  "Doble la rodilla": "doble=d:d o:o b:bsoft l:l e:e | la=l:l a:a | rodilla=r:rr o:o d:dsoft i:i ll:ll a:a",
  "perro": "perro=p:ptk e:e rr:rr o:o",
  "pero": "pero=p:ptk e:e r:r o:o",
  "¿Dónde le duele?": "dónde=d:d ó:o n:other d:d e:e | le=l:l e:e | duele=d:dsoft u:w e:e l:l e:e",
  "El niño tiene sueño": "el=e:e l:l | niño=n:other i:i ñ:ny o:o | tiene=t:ptk i:y e:e n:other e:e | sueño=s:s u:w e:e ñ:ny o:o",
  "La jirafa juega en el jardín": null,
  "Cinco zapatos azules": "cinco=c:th i:i n:other c:ptk o:o | zapatos=z:th a:a p:ptk a:a t:ptk o:o s:s | azules=a:a z:th u:u l:l e:e s:s",
  "Madrid es una ciudad grande": null,
  "Acuéstese boca arriba": null,
  "Hasta luego": "hasta=a:a s:s t:ptk a:a | luego=l:l u:w e:e g:gsoft o:o",
  "¿Qué hora es?": "qué=qu:ptk é:e | hora=o:o r:r a:a | es=e:e s:s",
  "Hago ejercicio": "hago=a:a g:gsoft o:o | ejercicio=e:e j:j e:e r:r c:th i:i c:th i:y o:o",
  "Un vaso de agua": "un=u:u n:other | vaso=v:b a:a s:s o:o | de=d:dsoft e:e | agua=a:a g:gsoft u:w a:a",
};
let fail = 0;
for (const [s, exp] of Object.entries(cases)) {
  const got = show(s);
  if (exp && got !== exp) { fail++; console.log("MISMATCH", s, "\n  got:", got, "\n  exp:", exp); }
  else console.log("ok  ", got);
}

// Fake Azure result: "Doble la rodilla" with a weak rolled r
const P = (ph, sc) => ({ Phoneme: ph, PronunciationAssessment: { AccuracyScore: sc } });
const fake = { NBest: [{ Display: "Doble la rodilla.", PronunciationAssessment: { AccuracyScore: 78, FluencyScore: 90, CompletenessScore: 100, PronScore: 82 },
  Words: [
    { Word: "doble", PronunciationAssessment: { AccuracyScore: 95, ErrorType: "None" }, Phonemes: [P("d",95),P("o",96),P("b",94),P("l",95),P("e",95)] },
    { Word: "la", PronunciationAssessment: { AccuracyScore: 98, ErrorType: "None" }, Phonemes: [P("l",98),P("a",98)] },
    { Word: "rodilla", PronunciationAssessment: { AccuracyScore: 58, ErrorType: "Mispronunciation" }, Phonemes: [P("r",20),P("o",90),P("d",70),P("i",90),P("j",80),P("a",90)] },
  ] }] };
const r = S.analyse("Doble la rodilla", fake);
console.log(JSON.stringify(r.words.map(w => [w.text, w.score, w.colour, w.problems.map(p => p.message || (p.spelling + " " + p.label + " " + p.score))])));
assert.strictEqual(r.overall, 82);
assert.strictEqual(r.words[2].colour, "bad");
assert.strictEqual(r.words[2].problems[0].key, "rr");
assert.strictEqual(r.words[2].problems[1].key, "dsoft");

// Skipped word + extra word, and no phoneme detail at all
const fake2 = { NBest: [{ PronunciationAssessment: { PronScore: 40 }, Words: [
  { Word: "respire", PronunciationAssessment: { AccuracyScore: 70, ErrorType: "Mispronunciation" } },
  { Word: "eh", PronunciationAssessment: { AccuracyScore: 0, ErrorType: "Insertion" } },
  { Word: "hondo", PronunciationAssessment: { AccuracyScore: 0, ErrorType: "Omission" } } ] }] };
const r2 = S.analyse("Respire hondo", fake2);
console.log(JSON.stringify(r2.words.map(w => [w.text, w.score, w.colour, w.problems.length])), r2.inserted);
assert.strictEqual(r2.words[1].error, "Omission");
assert.deepStrictEqual(r2.inserted, ["eh"]);
// mismatched phoneme count still works
const fake3 = { NBest: [{ PronunciationAssessment: { PronScore: 60 }, Words: [
  { Word: "perro", PronunciationAssessment: { AccuracyScore: 55, ErrorType: "Mispronunciation" }, Phonemes: [P("p",95),P("e",95),P("r",30),P("r",35),P("o",95)] } ] }] };
const r3 = S.analyse("perro", fake3);
assert.strictEqual(r3.words[0].problems[0].key, "rr");
// French comparisons and French-speaker traps
assert.ok(/throat like the French/.test(r.words[2].problems[0].french));
const fakeNasal = { NBest: [{ PronunciationAssessment: { PronScore: 55 }, Words: [
  { Word: "con", PronunciationAssessment: { AccuracyScore: 50, ErrorType: "Mispronunciation" }, Phonemes: [P("k",95),P("o",30),P("n",90)] },
  { Word: "mesa", PronunciationAssessment: { AccuracyScore: 60, ErrorType: "Mispronunciation" }, Phonemes: [P("m",95),P("e",95),P("s",95),P("a",30)] },
  { Word: "grande", PronunciationAssessment: { AccuracyScore: 55, ErrorType: "Mispronunciation" }, Phonemes: [P("g",95),P("r",95),P("a",95),P("n",95),P("d",95),P("e",20)] } ] }] };
const rn = S.analyse("con mesa grande", fakeNasal);
assert.ok(/nasal/.test(rn.words[0].problems[0].french), "nasal warning on 'con'");
assert.ok(/French 'é'/.test(rn.words[1].problems[0].french) || rn.words[1].problems[0].key === "a");
assert.ok(/silent/.test(rn.words[2].problems[0].french), "final e warning on 'grande'");
// Mexico accent: z / ce / ci are an s
S.setAccent("es-MX");
assert.strictEqual(show("Cinco zapatos"), "cinco=c:zs i:i n:other c:ptk o:o | zapatos=z:zs a:a p:ptk a:a t:ptk o:o s:s");
assert.ok(/house/.test(S.soundInfo("j").tip));
S.setAccent("es-ES");
assert.ok(/Bach/.test(S.soundInfo("j").tip));
console.log(fail ? fail + " FAILED" : "ALL SOUND TESTS PASSED");
process.exit(fail ? 1 : 0);
