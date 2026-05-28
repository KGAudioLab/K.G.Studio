export class LocalSeparatorTimingCollector {
  private readonly label: string;
  private readonly sections = new Map<string, { totalMs: number; count: number }>();
  private readonly startedAt = performance.now();

  constructor(label = 'timing') {
    this.label = label;
  }

  private track(name: string, durationMs: number): void {
    const section = this.sections.get(name) ?? { totalMs: 0, count: 0 };
    section.totalMs += durationMs;
    section.count += 1;
    this.sections.set(name, section);
  }

  public async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      return await fn();
    } finally {
      this.track(name, performance.now() - started);
    }
  }

  public measureSync<T>(name: string, fn: () => T): T {
    const started = performance.now();
    try {
      return fn();
    } finally {
      this.track(name, performance.now() - started);
    }
  }

  public getSummary(extra: Record<string, unknown> = {}): Record<string, unknown> {
    const sections: Record<string, { totalMs: number; count: number; averageMs: number }> = {};
    for (const [name, section] of this.sections.entries()) {
      sections[name] = {
        totalMs: Number(section.totalMs.toFixed(2)),
        count: section.count,
        averageMs: Number((section.totalMs / Math.max(section.count, 1)).toFixed(2)),
      };
    }

    return {
      label: this.label,
      totalMs: Number((performance.now() - this.startedAt).toFixed(2)),
      sections,
      ...extra,
    };
  }
}
