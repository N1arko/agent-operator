import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import * as z from "zod/v4";

const ThreadBindingSchema = z.object({
  threadId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  requesterAgentId: z.string().min(1),
});

const WorkerStateSchema = z.object({
  cursor: z.number().int().nonnegative().default(0),
  threads: z.record(z.string(), ThreadBindingSchema).default({}),
});
export type WorkerState = z.infer<typeof WorkerStateSchema>;

export const loadState = async (path: string): Promise<WorkerState> => {
  try {
    return WorkerStateSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { cursor: 0, threads: {} };
    }
    throw error;
  }
};

export const saveState = async (
  path: string,
  state: WorkerState,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, path);
};
