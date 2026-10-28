// Dev log timestamps: seconds since the bundle loaded, for reading
// conversation timings out of the Metro log.
const t0 = Date.now();

export function stamp(): string {
  return `+${((Date.now() - t0) / 1000).toFixed(2)}s`;
}
