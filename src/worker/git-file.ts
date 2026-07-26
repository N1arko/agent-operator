import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type {
  GitFileAttachment,
  ProjectConfig,
} from "../shared/protocol.js";

const execFileAsync = promisify(execFile);
const gitTimeoutMs = 30_000;

export type ResolvedGitFile = GitFileAttachment & {
  repositoryIdentity: string;
  fullRevision: string;
  size: number;
};

const runGit = async (cwd: string, args: string[]): Promise<string> => {
  try {
    const result = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      timeout: gitTimeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return result.stdout.trim();
  } catch {
    throw new Error(`Git operation failed: ${args[0] ?? "unknown"}`);
  }
};

const repositoryIdentity = (repository: string): string => {
  const value = repository.trim().replace(/\/+$/, "");
  const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(value);
  if (scp && !value.includes("://")) {
    return `${scp[1]?.toLowerCase()}/${scp[2]?.replace(/\.git$/, "")}`;
  }
  try {
    const url = new URL(value);
    if (url.password) throw new Error("Repository URL contains a password");
    if (url.protocol === "file:") {
      return `file:${decodeURIComponent(url.pathname).replace(/\.git$/, "")}`;
    }
    return `${url.hostname.toLowerCase()}/${decodeURIComponent(url.pathname)
      .replace(/^\/+/, "")
      .replace(/\.git$/, "")}`;
  } catch (error) {
    if (error instanceof Error && error.message.includes("password")) {
      throw error;
    }
    return value.replace(/\.git$/, "");
  }
};

const findRemote = async (
  projectPath: string,
  expectedRepository: string,
): Promise<{ name: string; identity: string }> => {
  const expectedIdentity = repositoryIdentity(expectedRepository);
  const names = (await runGit(projectPath, ["remote"]))
    .split(/\r?\n/)
    .filter(Boolean);
  for (const name of names) {
    const urls = (await runGit(projectPath, [
      "remote",
      "get-url",
      "--all",
      name,
    ]))
      .split(/\r?\n/)
      .filter(Boolean);
    if (urls.some((url) => repositoryIdentity(url) === expectedIdentity)) {
      return { name, identity: expectedIdentity };
    }
  }
  throw new Error(
    `Git repository is not configured for project: ${expectedIdentity}`,
  );
};

const resolveCommit = async (
  repositoryRoot: string,
  revision: string,
): Promise<string | null> => {
  try {
    const value = await runGit(repositoryRoot, [
      "rev-parse",
      "--verify",
      `${revision}^{commit}`,
    ]);
    return /^[a-f0-9]{40,64}$/.test(value) ? value : null;
  } catch {
    return null;
  }
};

const hashGitObject = (
  repositoryRoot: string,
  objectSpec: string,
): Promise<{ sha256: string; size: number }> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "git",
      ["-C", repositoryRoot, "cat-file", "blob", objectSpec],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const hash = createHash("sha256");
    let size = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error("Git file hashing timed out"));
      }
    }, gitTimeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      hash.update(chunk);
      size += chunk.length;
    });
    child.stderr.resume();
    child.on("error", () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error("Unable to read Git file"));
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(new Error("Git file does not exist at the requested revision"));
        return;
      }
      resolve({ sha256: hash.digest("hex"), size });
    });
  });

export const resolveGitFile = async (
  project: ProjectConfig,
  attachment: GitFileAttachment,
): Promise<ResolvedGitFile> => {
  const repositoryRoot = await runGit(project.path, [
    "rev-parse",
    "--show-toplevel",
  ]);
  const remote = await findRemote(repositoryRoot, attachment.repository);
  let fullRevision = await resolveCommit(repositoryRoot, attachment.revision);
  if (!fullRevision) {
    await runGit(repositoryRoot, ["fetch", "--quiet", remote.name]);
    fullRevision = await resolveCommit(repositoryRoot, attachment.revision);
  }
  if (!fullRevision) {
    throw new Error(`Git revision is unavailable: ${attachment.revision}`);
  }
  const objectSpec = `${fullRevision}:${attachment.path}`;
  const hashed = await hashGitObject(repositoryRoot, objectSpec);
  if (hashed.sha256 !== attachment.sha256) {
    throw new Error(`Git file checksum mismatch: ${attachment.path}`);
  }
  return {
    ...attachment,
    repositoryIdentity: remote.identity,
    fullRevision,
    size: hashed.size,
  };
};

export const appendGitFilesToPrompt = (
  prompt: string,
  files: ResolvedGitFile[],
): string => {
  if (files.length === 0) return prompt;
  const manifest = files.map((file) => ({
    type: file.type,
    repository: file.repositoryIdentity,
    revision: file.fullRevision,
    path: file.path,
    sha256: file.sha256,
    size: file.size,
  }));
  return `${prompt}

Agent Operator verified these Git files in the current local repository:
${JSON.stringify(manifest, null, 2)}

Read a file from its committed revision with \`git show <revision>:<path>\`.
Keep the current branch and working tree unchanged.`;
};
