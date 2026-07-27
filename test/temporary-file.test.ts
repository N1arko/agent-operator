import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import type { TemporaryFileAttachment } from "../src/shared/protocol.js";
import { CoordinatorClient } from "../src/worker/client.js";
import { downloadTemporaryFiles } from "../src/worker/temporary-file.js";

class FakeCoordinatorClient extends CoordinatorClient {
  constructor(private readonly content: Uint8Array) {
    super("http://127.0.0.1", "test-token");
  }

  override downloadTemporaryFile(): Promise<Uint8Array> {
    return Promise.resolve(this.content);
  }
}

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("temporary file download", () => {
  it("rejects checksum mismatches and removes the partial local copy", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aop-download-"));
    directories.push(directory);
    const expected = new TextEncoder().encode("expected");
    const attachment: TemporaryFileAttachment = {
      type: "temporary_file",
      fileId: "019fa0b8-1abc-73f0-8126-3f8b6d64466c",
      name: "draft.docx",
      size: expected.byteLength,
      sha256: createHash("sha256").update(expected).digest("hex"),
      expiresAt: "2099-01-01T00:00:00.000Z",
    };

    await assert.rejects(
      downloadTemporaryFiles(
        new FakeCoordinatorClient(
          new TextEncoder().encode("tampered"),
        ),
        directory,
        "019fa0d1-1abc-73f0-8126-3f8b6d64466c",
        [attachment],
      ),
      /checksum mismatch/,
    );
    assert.deepEqual(await readdir(directory), []);
  });
});
