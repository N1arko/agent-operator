import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, it } from "node:test";
import { GitFileAttachmentSchema } from "../src/shared/protocol.js";
import { resolveGitFile } from "../src/worker/git-file.js";

const execFileAsync = promisify(execFile);
const directories: string[] = [];

const git = async (directory: string, ...args: string[]): Promise<string> => {
  const result = await execFileAsync("git", ["-C", directory, ...args], {
    encoding: "utf8",
  });
  return result.stdout.trim();
};

const createRepository = async () => {
  const directory = await mkdtemp(join(tmpdir(), "aop-git-file-"));
  directories.push(directory);
  await git(directory, "init");
  await git(directory, "config", "user.name", "Agent Operator Test");
  await git(directory, "config", "user.email", "test@example.invalid");
  await mkdir(join(directory, "docs"));
  const content = "verified migration plan\n";
  await writeFile(join(directory, "docs", "plan.md"), content);
  await git(directory, "add", "docs/plan.md");
  await git(directory, "commit", "-m", "Add plan");
  await git(
    directory,
    "remote",
    "add",
    "origin",
    "git@github.com:example/project.git",
  );
  return {
    directory,
    revision: await git(directory, "rev-parse", "HEAD"),
    sha256: createHash("sha256").update(content).digest("hex"),
  };
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Git file attachments", () => {
  it("resolves and verifies a committed file without checkout", async () => {
    const repository = await createRepository();
    const branchBefore = await git(
      repository.directory,
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    );
    const resolved = await resolveGitFile(
      {
        id: "project",
        name: "Project",
        path: repository.directory,
        tags: [],
      },
      GitFileAttachmentSchema.parse({
        type: "git_file",
        repository: "https://github.com/example/project.git",
        revision: repository.revision.slice(0, 12),
        path: "docs/plan.md",
        sha256: repository.sha256,
      }),
    );

    assert.equal(resolved.repositoryIdentity, "github.com/example/project");
    assert.equal(resolved.fullRevision, repository.revision);
    assert.equal(resolved.size, Buffer.byteLength("verified migration plan\n"));
    assert.equal(
      await git(repository.directory, "rev-parse", "--abbrev-ref", "HEAD"),
      branchBefore,
    );
  });

  it("rejects repository, path and checksum mismatches", async () => {
    const repository = await createRepository();
    const project = {
      id: "project",
      name: "Project",
      path: repository.directory,
      tags: [],
    };
    const attachment = {
      type: "git_file" as const,
      repository: "git@github.com:example/project.git",
      revision: repository.revision,
      path: "docs/plan.md",
      sha256: repository.sha256,
    };

    await assert.rejects(
      resolveGitFile(project, {
        ...attachment,
        repository: "git@github.com:other/project.git",
      }),
      /not configured/,
    );
    await assert.rejects(
      resolveGitFile(project, {
        ...attachment,
        path: "docs/missing.md",
      }),
      /does not exist/,
    );
    await assert.rejects(
      resolveGitFile(project, {
        ...attachment,
        sha256: "0".repeat(64),
      }),
      /checksum mismatch/,
    );
  });

  it("rejects revisions that are not commit hashes and unsafe paths", () => {
    assert.equal(
      GitFileAttachmentSchema.safeParse({
        type: "git_file",
        repository: "git@github.com:example/project.git",
        revision: "main",
        path: "docs/plan.md",
        sha256: "0".repeat(64),
      }).success,
      false,
    );
    assert.equal(
      GitFileAttachmentSchema.safeParse({
        type: "git_file",
        repository: "git@github.com:example/project.git",
        revision: "a".repeat(40),
        path: "../secret.txt",
        sha256: "0".repeat(64),
      }).success,
      false,
    );
  });
});
