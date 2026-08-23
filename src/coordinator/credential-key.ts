import {
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

const KEY_BYTES = 32;
const KEY_HEX_LENGTH = KEY_BYTES * 2;

const readCredentialKey = (path: string): Buffer => {
  const value = readFileSync(path, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Invalid credential key file: ${path}`);
  }
  chmodSync(path, 0o600);
  return Buffer.from(value, "hex");
};

// @spec spec://modules/coordinator/FEAT-007-device-enrollment#data
export const loadOrCreateCredentialKey = (path: string): Buffer => {
  mkdirSync(dirname(path), { recursive: true });
  try {
    return readCredentialKey(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }

  const key = randomBytes(KEY_BYTES);
  try {
    writeFileSync(path, `${key.toString("hex")}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return readCredentialKey(path);
  }
};

export const assertCredentialKey = (key: Uint8Array): Uint8Array => {
  if (
    key.length !== KEY_BYTES ||
    Buffer.from(key).toString("hex").length !== KEY_HEX_LENGTH
  ) {
    throw new Error("Credential key must contain exactly 32 bytes");
  }
  return key;
};
