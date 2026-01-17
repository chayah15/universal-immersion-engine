import assert from "node:assert/strict";
import {
    parseJsonLoose,
    normalizeDatabankArrayInPlace,
    toDatabankDisplayEntries
} from "../src/modules/databankModel.js";

function makeIdFactory() {
    let i = 0;
    return () => `db_test_${++i}`;
}

{
    const obj = parseJsonLoose('```json\n{"title":"A","summary":"B"}\n```');
    assert.equal(obj.title, "A");
    assert.equal(obj.summary, "B");
}

{
    const arr = [];
    const changed = normalizeDatabankArrayInPlace(arr, { now: 1000, makeId: makeIdFactory() });
    assert.equal(changed, false);
    assert.deepEqual(toDatabankDisplayEntries(arr), []);
}

{
    const arr = [{ id: 1700000000000, title: "Hello", summary: "World" }];
    const changed = normalizeDatabankArrayInPlace(arr, { now: 2000, makeId: makeIdFactory() });
    assert.equal(changed, true);
    assert.equal(typeof arr[0].id, "string");
    assert.equal(arr[0].created, 1700000000000);
    assert.ok(String(arr[0].date || "").length > 0);
    const disp = toDatabankDisplayEntries(arr);
    assert.equal(disp[0].type, "archive");
    assert.equal(disp[0].title, "Hello");
    assert.equal(disp[0].body, "World");
}

{
    const arr = [{ key: "Term", entry: "Meaning <&>", id: "" }];
    normalizeDatabankArrayInPlace(arr, { now: 3000, makeId: makeIdFactory() });
    assert.equal(arr[0].title, "Term");
    assert.equal(arr[0].summary, "Meaning <&>");
    const disp = toDatabankDisplayEntries(arr);
    assert.equal(disp[0].type, "lore");
    assert.equal(disp[0].body, "Meaning <&>");
}

{
    const arr = Array.from({ length: 1200 }, (_, i) => ({ id: `x${i}`, created: 1000 + i, title: `T${i}`, summary: `S${i}` }));
    normalizeDatabankArrayInPlace(arr, { now: 4000, makeId: makeIdFactory() });
    const disp = toDatabankDisplayEntries(arr);
    assert.equal(disp.length, 1200);
    assert.equal(disp[1199].title, "T1199");
}

console.log("databankModel tests: OK");

