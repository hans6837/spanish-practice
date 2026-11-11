// Run with: node tests/test_course.js
const assert = require("assert");
const fs = require("fs");
const Course = require("../course.js");
// 1. sample course in the described shape
const c = Course.normalize(JSON.parse(fs.readFileSync(__dirname + "/sample_course.json", "utf8")));
assert.strictEqual(c.levels.length, 3);
const u = c.levels[0].units[0];
assert.strictEqual(u.title, "Las cinco vocales");
assert.ok(u.lesson.startsWith("Spanish has only five vowels"));
assert.strictEqual(u.examples.length, 2);
assert.deepStrictEqual(u.items[0], { es: "casa", en: "house", fr: "maison", tip: "KA-sa", key: "casa" });
assert.strictEqual(u.id, "L1-las-cinco-vocales");
// 2. same text => same key, whatever the punctuation or capitals
assert.strictEqual(Course.itemKey("¿Dónde le duele?"), Course.itemKey("dónde  le DUELE"));
assert.notStrictEqual(Course.itemKey("sí"), Course.itemKey("si"));
// 3. Spanish field names, lesson as paragraphs, items as plain strings, top-level array
const c2 = Course.normalize([{ nombre: "Nivel 1", unidades: [{ titulo: "Vocales", leccion: ["Párrafo uno.", "Párrafo dos."],
  ejemplos: ["a e i o u"], palabras: [{ palabra: "casa", traduccion: "house", francés: "maison", pronunciacion: "KA-sa" }, "mesa", { english: "no spanish" }] }] }]);
const u2 = c2.levels[0].units[0];
assert.strictEqual(u2.lesson, "Párrafo uno.\n\nPárrafo dos.");
assert.strictEqual(u2.items.length, 2);
assert.strictEqual(u2.items[0].tip, "KA-sa");
assert.strictEqual(c2.report.skipped.length, 1);
// 4. fallback to the old decks
global.window = undefined;
const decks = { decks: ["Basics"], items: [{ id: "basics-01", deck: "Basics", es: "Hola", en: "Hello", fr: "Bonjour" }] };
const c3 = Course.fromDecks(decks);
assert.strictEqual(c3.levels[0].units[0].items[0].key, "hola");
console.log("ALL COURSE TESTS PASSED (" + c.report.units + " units, " + c.report.items + " items in sample)");
