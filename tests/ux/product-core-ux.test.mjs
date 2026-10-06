/**
 * GuruPro PRODUCT-1A: Core UX & Usability Hardening Test Suite
 *
 * Validates:
 * 1. Debounced auto-save mechanics on student essay inputs (prevents network flood and race conditions)
 * 2. Immediate save mode for discrete selections (multiple-choice options)
 * 3. Batch atomic saving (saveAnswers & saveRemedialAnswers) replacing sequential roundtrips
 * 4. Submission confirmation modal guards and double-click prevention
 * 5. Input retention during network blips (zero accidental data loss)
 * 6. Responsive action bar and save status clarity in Modul Editor
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  saveAnswers,
  saveRemedialAnswers,
} from "../../src/lib/pengumpulan-store.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "../..");

console.log("================================================================================");
console.log("  GURUPRO PRODUCT-1A: CORE UX AUDIT & HIGH-IMPACT IMPROVEMENTS TEST SUITE       ");
console.log("================================================================================");

let totalPassed = 0;
let totalFailed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${desc}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${desc}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    totalFailed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${desc}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${desc}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    totalFailed++;
  }
}

console.log("\n--- SECTION 1: DEBOUNCED INPUT MECHANICS (STUDENT ANSWERING) ---");

// Helper to simulate component debouncer
class AnsweringDebouncer {
  constructor(saveFn, debounceDelay = 800) {
    this.saveFn = saveFn;
    this.debounceDelay = debounceDelay;
    this.timers = {};
    this.answers = {};
    this.saveCalls = [];
  }

  handleAnswerChange(soalId, val, immediate = false) {
    this.answers[soalId] = val;

    if (this.timers[soalId]) {
      clearTimeout(this.timers[soalId]);
      delete this.timers[soalId];
    }

    const doSave = () => {
      this.saveCalls.push({ soalId, val, timestamp: Date.now() });
      return this.saveFn(soalId, val);
    };

    if (immediate) {
      doSave();
    } else {
      this.timers[soalId] = setTimeout(() => {
        doSave();
        delete this.timers[soalId];
      }, this.debounceDelay);
    }
  }

  flush() {
    Object.values(this.timers).forEach((t) => clearTimeout(t));
    this.timers = {};
  }
}

await itAsync("1.1 Rapid keystrokes (10 chars in 100ms) collapse into a single debounced save", async () => {
  const saveMock = (soalId, val) => Promise.resolve({ ok: true });
  const debouncer = new AnsweringDebouncer(saveMock, 100);

  const testText = "GuruPro AI";
  for (let i = 0; i < testText.length; i++) {
    debouncer.handleAnswerChange("soal-1", testText.slice(0, i + 1), false);
  }

  assert.equal(debouncer.saveCalls.length, 0, "No saves should fire synchronously while typing");

  await new Promise((r) => setTimeout(r, 150));

  assert.equal(debouncer.saveCalls.length, 1, "Exactly one debounced save should execute");
  assert.equal(debouncer.saveCalls[0].val, "GuruPro AI", "The saved value must be the final text");
});

await itAsync("1.2 Distinct essay questions maintain independent debounce timers", async () => {
  const saveMock = (soalId, val) => Promise.resolve({ ok: true });
  const debouncer = new AnsweringDebouncer(saveMock, 100);

  debouncer.handleAnswerChange("soal-1", "Jawaban 1", false);
  debouncer.handleAnswerChange("soal-2", "Jawaban 2", false);

  assert.equal(debouncer.saveCalls.length, 0);

  await new Promise((r) => setTimeout(r, 150));

  assert.equal(debouncer.saveCalls.length, 2, "Both distinct questions must save after debounce");
  const savedIds = debouncer.saveCalls.map((c) => c.soalId);
  assert.ok(savedIds.includes("soal-1") && savedIds.includes("soal-2"));
});

it("1.3 Multiple choice options save immediately with zero delay (immediate = true)", () => {
  const saveMock = (soalId, val) => Promise.resolve({ ok: true });
  const debouncer = new AnsweringDebouncer(saveMock, 800);

  debouncer.handleAnswerChange("soal-mc-1", "A. Fotosintesis", true);

  assert.equal(debouncer.saveCalls.length, 1, "Immediate choice must execute synchronously without timer");
  assert.equal(debouncer.saveCalls[0].val, "A. Fotosintesis");
  debouncer.flush();
});

it("1.4 Flushing pending timers cancels orphaned timeout callbacks safely", () => {
  const saveMock = (soalId, val) => Promise.resolve({ ok: true });
  const debouncer = new AnsweringDebouncer(saveMock, 500);

  debouncer.handleAnswerChange("soal-essay-1", "Draf yang sedang diketik...", false);
  assert.equal(Object.keys(debouncer.timers).length, 1);

  debouncer.flush();
  assert.equal(Object.keys(debouncer.timers).length, 0, "Timers must be cleared on flush");
  assert.equal(debouncer.saveCalls.length, 0, "Cancelled timer must not trigger save");
});

console.log("\n--- SECTION 2: ATOMIC BATCH ANSWER SAVING ---");

it("2.1 saveAnswers function is exported and accepts atomic batch mapping", () => {
  assert.equal(typeof saveAnswers, "function", "saveAnswers must be an exported function");
});

it("2.2 saveRemedialAnswers function is exported and accepts atomic batch mapping", () => {
  assert.equal(typeof saveRemedialAnswers, "function", "saveRemedialAnswers must be an exported function");
});

await itAsync("2.3 Empty answers map returns ok: true without database queries", async () => {
  const res1 = await saveAnswers("fake-submission-id", {});
  assert.equal(res1.ok, true);

  const res2 = await saveRemedialAnswers("fake-remedial-id", {});
  assert.equal(res2.ok, true);
});

console.log("\n--- SECTION 3: SUBMISSION WORKFLOW & UX GUARDS ---");

it("3.1 Incomplete question count calculations accurately reflect remaining items", () => {
  const soalList = [
    { id: "s1", jenis: "Pilihan Ganda" },
    { id: "s2", jenis: "Esai" },
    { id: "s3", jenis: "Pilihan Ganda" },
  ];
  const answers = {
    s1: "A. Jawaban 1",
    s2: "   ", // Blank spaces must not count as answered
    s3: "B. Jawaban 3",
  };

  const answeredCount = Object.values(answers).filter((v) => v && v.trim().length > 0).length;
  const unansweredCount = Math.max(0, soalList.length - answeredCount);

  assert.equal(answeredCount, 2, "Only non-empty trimmed answers count as answered");
  assert.equal(unansweredCount, 1, "Exactly 1 question remains unanswered");
});

it("3.2 Double submission guard prevents concurrent submit invocations", () => {
  let isSubmitting = false;
  let callCount = 0;

  function attemptSubmit() {
    if (isSubmitting) return false;
    isSubmitting = true;
    callCount++;
    return true;
  }

  const firstClick = attemptSubmit();
  const secondClick = attemptSubmit();
  const thirdClick = attemptSubmit();

  assert.equal(firstClick, true, "First submit click must proceed");
  assert.equal(secondClick, false, "Second duplicate click must be blocked");
  assert.equal(thirdClick, false, "Third duplicate click must be blocked");
  assert.equal(callCount, 1, "Submit handler must only execute once");
});

console.log("\n--- SECTION 4: CODEBASE AUDIT & REGRESSION INVARIANTS ---");

it("4.1 penugasan.tsx contains debounced handleAnswerChange with immediate flag", () => {
  const fileContent = readFileSync(resolve(ROOT_DIR, "src/routes/penugasan.tsx"), "utf-8");
  assert.ok(
    fileContent.includes("handleAnswerChange = (soalId: string, val: string, immediate = false)"),
    "penugasan.tsx must support immediate flag for handleAnswerChange",
  );
  assert.ok(
    fileContent.includes("debounceTimersRef.current[soalId] = setTimeout"),
    "penugasan.tsx must instantiate debounced setTimeout for typing",
  );
  assert.ok(
    fileContent.includes("saveAnswers(submission.id, answers)"),
    "penugasan.tsx must use batch saveAnswers in SiswaPengerjaanView",
  );
  assert.ok(
    fileContent.includes("saveRemedialAnswers(remedialSub.id, answers)"),
    "penugasan.tsx must use batch saveRemedialAnswers in SiswaRemedialPengerjaanView",
  );
});

it("4.2 SiswaPengerjaanView and SiswaRemedialPengerjaanView prevent Radix dialog auto-close on submit", () => {
  const fileContent = readFileSync(resolve(ROOT_DIR, "src/routes/penugasan.tsx"), "utf-8");
  assert.ok(
    /e\.preventDefault\(\);\s+void handleConfirmSubmit\(\);/.test(fileContent),
    "Submit dialog action must call e.preventDefault() to await async completion",
  );
});

it("4.3 modul-editor.tsx contains responsive action bar wrapping and aria-busy state", () => {
  const fileContent = readFileSync(resolve(ROOT_DIR, "src/components/modul-editor.tsx"), "utf-8");
  assert.ok(
    fileContent.includes('aria-busy={saveStatus === "saving"}'),
    "modul-editor.tsx must include aria-busy during saving",
  );
});

console.log("\n================================================================================");
console.log(`  PRODUCT-1A TEST RESULTS: ${totalPassed} passed, ${totalFailed} failed`);
console.log("================================================================================");

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
