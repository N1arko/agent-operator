export const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const parseTokenMap = (value: string): Map<string, string> => {
  const result = new Map<string, string>();
  for (const entry of value.split(",")) {
    const separator = entry.indexOf(":");
    if (separator < 1) throw new Error("Invalid AOP_DEVICE_TOKENS entry");
    const agentId = entry.slice(0, separator).trim();
    const token = entry.slice(separator + 1).trim();
    if (!agentId || token.length < 16) {
      throw new Error("Device tokens must include agent id and at least 16 characters");
    }
    result.set(token, agentId);
  }
  return result;
};
