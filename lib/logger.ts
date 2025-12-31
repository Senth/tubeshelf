const LEVELS: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function currentLevel(): number {
  const raw = (process.env.LOG_LEVEL || "error").toString().toLowerCase();
  return LEVELS[raw] ?? LEVELS.error;
}

export function error(...args: any[]) {
  console.error(...args);
}

export function warn(...args: any[]) {
  if (currentLevel() >= LEVELS.warn) console.warn(...args);
}

export function info(...args: any[]) {
  if (currentLevel() >= LEVELS.info) console.log(...args);
}

export function debug(...args: any[]) {
  if (currentLevel() >= LEVELS.debug) console.log(...args);
}

export default { error, warn, info, debug };
