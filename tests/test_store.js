// Run with: node tests/test_store.js
const assert = require("assert");
const Store = require("../store.js");
function mem() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; }
const builtin = { decks: ["D", "Other"], items: [{ id: "a", deck: "D", es: "uno" }, { id: "b", deck: "D", es: "dos" }, { id: "c", deck: "D", es: "tres" }, { id: "z", deck: "Other", es: "zeta" }] };
const storage = mem();
let s = new Store(storage, builtin);
const now = 1000000;
assert.strictEqual(s.chooseNext("D", [], [], now).item.id, "a");
assert.strictEqual(s.chooseNext("D", ["a"], ["a"], now).item.id, "b");
s.recordAttempt({ item_id: "a", first: true, overall: 40, accuracy: 40, fluency: 50, completeness: 100, sounds: [{ key: "rr", score: 20 }, { key: "rr", score: 30 }] }, now);
assert.strictEqual(s.data.review.a.level, 0);
assert.strictEqual(s.data.review.a.due, now + 3 * 60000);
assert.deepStrictEqual(s.chooseNext("D", ["b"], ["a", "b"], now + 200000), { item: s.items()[0], why: "review" });
s.recordAttempt({ item_id: "a", first: false, overall: 95 }, now);            // retries don't change the schedule
assert.strictEqual(s.data.review.a.level, 0);
s.updateReview("b", 95, now); s.updateReview("b", 95, now);
assert.strictEqual(s.data.review.b.level, 2);
s.updateReview("b", 70, now);
assert.strictEqual(s.data.review.b.level, 1);
// settings
assert.ok(s.saveSettings({ key: "short" }));
assert.strictEqual(s.saveSettings({ key: "0123456789abcdef0123456789abcdef", region: "West Europe" }), null);
assert.strictEqual(s.settings().region, "westeurope");
assert.ok(s.isConfigured());
// custom items
const r = s.addItem("el fémur", "femur", "le fémur", "Anatomy");
assert.ok(r.item.id.startsWith("my-"));
assert.deepStrictEqual(s.decks(), ["D", "Other", "Anatomy"]);
// persistence: a new Store reads the same data back
s = new Store(storage, builtin);
assert.strictEqual(s.items().length, 5);
assert.strictEqual(s.settings().region, "westeurope");
const p = s.progress({ rr: "rolled r" }, now);
assert.strictEqual(p.items_practised, 2);
assert.strictEqual(p.sounds[0].label, "rolled r");
assert.strictEqual(p.daily.length, 1);
// backup without key, restore keeps the key on this device
const backup = s.exportJSON(false);
assert.ok(!backup.includes("0123456789abcdef"));
const s2 = new Store(mem(), builtin);
s2.saveSettings({ key: "ffffffffffffffffffffffffffffffff", region: "francecentral" });
assert.strictEqual(s2.importJSON(backup), null);
assert.strictEqual(s2.settings().key, "ffffffffffffffffffffffffffffffff");
assert.strictEqual(s2.data.attempts.length, 2);
assert.ok(s2.importJSON("nonsense"));
s.deleteItem(r.item.id);
assert.strictEqual(s.items().length, 4);
console.log("ALL STORE TESTS PASSED");
