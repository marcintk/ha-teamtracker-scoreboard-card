import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebugMetrics } from "../../src/runtime/debug.js";

describe("DebugMetrics", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe("track / counts", () => {
    it("records timestamps and returns correct window counts", () => {
      const d = new DebugMetrics();
      d.track("events");
      d.track("events");
      vi.advanceTimersByTime(30_000);
      d.track("events");
      const c = d.counts("events");
      expect(c.min1).toBe(3);
      expect(c.min5).toBe(3);
      expect(c.min15).toBe(3);
      expect(c.min30).toBe(3);
      expect(c.hour3).toBe(3);
    });

    it("excludes entries outside the 1-minute window", () => {
      const d = new DebugMetrics();
      d.track("events");
      vi.advanceTimersByTime(61_000);
      d.track("events");
      const c = d.counts("events");
      expect(c.min1).toBe(1);
      expect(c.min5).toBe(2);
      expect(c.min15).toBe(2);
      expect(c.min30).toBe(2);
      expect(c.hour3).toBe(2);
    });

    it("excludes entries outside the 5-minute window", () => {
      const d = new DebugMetrics();
      d.track("events");
      vi.advanceTimersByTime(301_000);
      d.track("events");
      const c = d.counts("events");
      expect(c.min1).toBe(1);
      expect(c.min5).toBe(1);
      expect(c.min15).toBe(2);
      expect(c.min30).toBe(2);
      expect(c.hour3).toBe(2);
    });

    it("excludes entries outside the 15-minute window", () => {
      const d = new DebugMetrics();
      d.track("events");
      vi.advanceTimersByTime(900_001);
      d.track("events");
      const c = d.counts("events");
      expect(c.min1).toBe(1);
      expect(c.min5).toBe(1);
      expect(c.min15).toBe(1);
      expect(c.min30).toBe(2);
      expect(c.hour1).toBe(2);
      expect(c.hour3).toBe(2);
    });

    it("excludes entries outside the 30-minute window", () => {
      const d = new DebugMetrics();
      d.track("events");
      vi.advanceTimersByTime(1_800_001);
      d.track("events");
      const c = d.counts("events");
      expect(c.min1).toBe(1);
      expect(c.min5).toBe(1);
      expect(c.min15).toBe(1);
      expect(c.min30).toBe(1);
      expect(c.hour1).toBe(2);
      expect(c.hour3).toBe(2);
    });

    it("excludes entries outside the 1-hour window", () => {
      const d = new DebugMetrics();
      d.track("events");
      vi.advanceTimersByTime(3_600_001);
      d.track("events");
      const c = d.counts("events");
      expect(c.min1).toBe(1);
      expect(c.min5).toBe(1);
      expect(c.min15).toBe(1);
      expect(c.min30).toBe(1);
      expect(c.hour1).toBe(1);
      expect(c.hour3).toBe(2);
    });

    it("prunes entries older than 3 hours", () => {
      const d = new DebugMetrics();
      d.track("rendered");
      vi.advanceTimersByTime(10_800_001);
      d.track("rendered");
      expect(d.counts("rendered").hour3).toBe(1);
    });

    it("tracks each metric key independently", () => {
      const d = new DebugMetrics();
      d.track("filtered");
      d.track("filtered");
      d.track("rendered");
      expect(d.counts("filtered").hour3).toBe(2);
      expect(d.counts("rendered").hour3).toBe(1);
      expect(d.counts("events").hour3).toBe(0);
    });

    it("counts all windows simultaneously when entries span multiple windows", () => {
      const d = new DebugMetrics();
      d.track("events");
      vi.advanceTimersByTime(70_000);
      d.track("events");
      const c = d.counts("events");
      expect(c.min1).toBe(1);
      expect(c.min5).toBe(2);
      expect(c.min15).toBe(2);
      expect(c.min30).toBe(2);
      expect(c.hour1).toBe(2);
      expect(c.hour3).toBe(2);
    });

    it("entries between 1h and 3h appear in hour3 but not hour1", () => {
      const d = new DebugMetrics();
      d.track("events");
      vi.advanceTimersByTime(3_700_000);
      d.track("events");
      const c = d.counts("events");
      expect(c.hour1).toBe(1);
      expect(c.hour3).toBe(2);
    });
  });

  describe("tableHtml", () => {
    it("contains all metric row labels", () => {
      const d = new DebugMetrics();
      const h = d.tableHtml();
      expect(h).toContain("events");
      expect(h).toContain("filtered");
      expect(h).toContain("rendered");
    });

    it("contains all column headers", () => {
      const d = new DebugMetrics();
      const h = d.tableHtml();
      expect(h).toContain("1m");
      expect(h).toContain("5m");
      expect(h).toContain("15m");
      expect(h).toContain("30m");
      expect(h).toContain("1h");
      expect(h).toContain("3h");
    });

    it("does not contain a 6h column", () => {
      const d = new DebugMetrics();
      expect(d.tableHtml()).not.toContain("6h");
    });

    it("does not contain outer wrapper positioning styles", () => {
      const d = new DebugMetrics();
      expect(d.tableHtml()).not.toContain("position:absolute");
      expect(d.tableHtml()).not.toContain("pointer-events:none");
    });

    it("row labels are colored orange", () => {
      const d = new DebugMetrics();
      const h = d.tableHtml();
      expect(h).toContain('color:orange">events');
      expect(h).toContain('color:orange">filtered');
      expect(h).toContain('color:orange">rendered');
    });

    it('shows "--" when no render has been tracked', () => {
      const d = new DebugMetrics();
      expect(d.tableHtml()).toContain("--");
    });

    it('shows no "ago" when no render has been tracked', () => {
      const d = new DebugMetrics();
      expect(d.tableHtml()).not.toContain("ago");
    });

    it("shows the last tracked render timestamp", () => {
      const d = new DebugMetrics();
      const fixed = new Date("2026-06-13T10:01:46.123Z");
      vi.setSystemTime(fixed);
      d.track("rendered");
      const pad = (n: number, w = 2) => String(n).padStart(w, "0");
      const expected = `${pad(fixed.getHours())}:${pad(fixed.getMinutes())}:${pad(fixed.getSeconds())}.${pad(fixed.getMilliseconds(), 3)}`;
      expect(d.tableHtml()).toContain(expected);
    });

    it('appends "(Xs ago)" when render was seconds ago', () => {
      const d = new DebugMetrics();
      vi.setSystemTime(new Date("2026-06-13T10:00:00.000Z"));
      d.track("rendered");
      vi.advanceTimersByTime(10_000);
      expect(d.tableHtml()).toContain("(10s ago)");
    });

    it('appends "(Xm ago)" when render was minutes ago', () => {
      const d = new DebugMetrics();
      vi.setSystemTime(new Date("2026-06-13T10:00:00.000Z"));
      d.track("rendered");
      vi.advanceTimersByTime(120_000);
      expect(d.tableHtml()).toContain("(2m ago)");
    });

    it('appends "(Xh ago)" when render was hours ago', () => {
      const d = new DebugMetrics();
      vi.setSystemTime(new Date("2026-06-13T10:00:00.000Z"));
      d.track("rendered");
      vi.advanceTimersByTime(7_200_000);
      expect(d.tableHtml()).toContain("(2h ago)");
    });

    it("timestamp is colored indianred", () => {
      const d = new DebugMetrics();
      expect(d.tableHtml()).toContain("color:indianred");
    });
  });
});
