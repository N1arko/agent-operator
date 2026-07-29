import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const skillPath = resolve(
  "integrations/skills/coordinate-agents/SKILL.md",
);

test("routes execution through stable model-agnostic profiles", async () => {
  const skill = await readFile(skillPath, "utf8");

  for (const profile of ["fast", "balanced", "deep"]) {
    assert.match(skill, new RegExp(`\\\`${profile}\\\``));
  }
  assert.match(skill, /smallest sufficient model/);
  assert.match(skill, /highest available reasoning effort only/);
  assert.match(skill, /executionProfile/);
  assert.match(skill, /selectionReason/);
  assert.equal(/\b(?:gpt|codex|sol)[-_ ]?\d/i.test(skill), false);
});

test("keeps follow-up and progress delivery unambiguous", async () => {
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /caller-stable `idempotencyKey`/);
  assert.match(skill, /Choose exactly one of `agent_send` and `agent_thread_send`/);
  assert.match(skill, /`isFinal: false` as progress/);
  assert.match(skill, /`isFinal: true`/);
});
