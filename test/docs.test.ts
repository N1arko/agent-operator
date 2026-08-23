import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { describe, it } from "node:test";

const execFile = promisify(execFileCallback);

describe("public documentation", () => {
  // @spec spec://common/PROP-007-OPEN-SOURCE#documentation
  it("keeps EN/RU critical paths, local links and public placeholders valid", async () => {
    const result = await execFile("node", ["scripts/docs-check.mjs"]);
    const receipt = JSON.parse(result.stdout) as { ok: boolean; documents: number; pairs: number; brokenLinks: number };
    assert.equal(receipt.ok, true);
    assert.equal(receipt.documents, 32);
    assert.equal(receipt.pairs, 11);
    assert.equal(receipt.brokenLinks, 0);
  });
});
