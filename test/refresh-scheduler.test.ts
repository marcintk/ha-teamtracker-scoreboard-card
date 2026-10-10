import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshScheduler, type RefreshSchedulerOptions } from "../src/refresh-scheduler.js";
import type { CardConfig, HomeAssistant } from "../src/types.js";

const mk = (state: string) => ({ states: { "sensor.a": { state } } }) as unknown as HomeAssistant;

function setup() {
  const onRender = vi.fn();
  const scheduler = new RefreshScheduler({ onRender });
  scheduler.configure({
    lazy_refresh: 5,
    fixed_refresh: 0,
    sections: [{ prefix: "sensor." }],
  } as unknown as CardConfig);
  scheduler.attach();
  scheduler.setHass(mk("0"));
  scheduler.refreshTracked(["sensor.a"]);
  onRender.mockClear();
  return { scheduler, onRender };
}

describe("RefreshScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces changes into one lazy render; unchanged states do not render", async () => {
    const { scheduler, onRender } = setup();
    scheduler.setHass({ states: { ...scheduler.hass?.states } } as unknown as HomeAssistant);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onRender).not.toHaveBeenCalled();
    scheduler.setHass(mk("1"));
    await vi.advanceTimersByTimeAsync(2000);
    scheduler.setHass(mk("2"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it("detach stops a pending renderTimer", async () => {
    const { scheduler, onRender } = setup();
    scheduler.setHass(mk("1"));
    expect(scheduler.renderTimer.active).toBe(true);
    scheduler.detach();
    expect(scheduler.renderTimer.active).toBe(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(onRender).not.toHaveBeenCalled();
  });

  it("configure stops a pending renderTimer", () => {
    const { scheduler } = setup();
    scheduler.setHass(mk("1"));
    expect(scheduler.renderTimer.active).toBe(true);
    scheduler.configure({ fixed_refresh: 0 } as unknown as CardConfig);
    expect(scheduler.renderTimer.active).toBe(false);
  });

  it("owns tracked ids: refreshTracked builds them from config sections, reset clears", () => {
    const s = new RefreshScheduler({ onRender: vi.fn() });
    s.configure({ sections: [{ prefix: "sensor.nba_" }] } as unknown as CardConfig);
    const ids = s.refreshTracked(["sensor.nba_lal", "sensor.other"]);
    expect([...ids]).toEqual(["sensor.nba_lal"]);
    expect(s.trackedIds).toBe(ids);
    expect(s.trackedBySection?.get(0)).toEqual(["sensor.nba_lal"]);
    s.reset();
    expect(s.trackedIds).toBeNull();
    expect(s.trackedBySection).toBeNull();
  });

  describe("lifecycle", () => {
    const cfg = (o: object = {}) => ({ fixed_refresh: 0, ...o }) as unknown as CardConfig;
    const mkHass = () => ({ hass: mk("0") });
    function make(opts: Partial<RefreshSchedulerOptions> = {}) {
      const onRender = vi.fn(() => {
        s.trackedIds = new Set(["sensor.a"]);
      });
      const s = new RefreshScheduler({ onRender, ...opts });
      return {
        s,
        onRender,
        drop: () => (s.trackedIds = null),
        track: () => (s.trackedIds = new Set(["sensor.a"])),
      };
    }

    it("first setHass renders; an unchanged later setHass does not", () => {
      const { s, onRender } = make();
      const { hass } = mkHass();
      s.configure(cfg());
      s.setHass(hass);
      s.setHass({ ...hass });
      expect(onRender).toHaveBeenCalledTimes(1);
    });

    it("hass before config builds tracked ids without rendering", () => {
      const { s, onRender } = make();
      const { hass } = mkHass();
      s.setHass(hass);
      expect(s.trackedIds).not.toBeNull();
      expect(onRender).not.toHaveBeenCalled();
    });

    it("configure while detached stores config but does not start timers or render", () => {
      const { s, onRender } = make();
      s.detach();
      s.setHass(mkHass().hass);
      s.configure(cfg({ fixed_refresh: 10 }));
      expect(s.fixedTimer.active).toBe(false);
      expect(onRender).not.toHaveBeenCalled();
    });

    it("configure with hass already set renders and calls onConfigured", () => {
      const onConfigured = vi.fn();
      const { s, onRender } = make({ onConfigured });
      const { hass } = mkHass();
      s.hass = hass;
      s.configure(cfg());
      expect(onConfigured).toHaveBeenCalledTimes(1);
      expect(onRender).toHaveBeenCalledTimes(1);
    });

    it("attach without config does nothing", () => {
      const { s } = make();
      s.attach();
      expect(s.fixedTimer.active).toBe(false);
    });

    it("attach re-renders only when hass is set and tracked ids were dropped", () => {
      const { s, onRender, drop } = make();
      const { hass } = mkHass();
      s.configure(cfg());
      s.setHass(hass);
      onRender.mockClear();
      s.attach(); // tracked ids intact
      expect(onRender).not.toHaveBeenCalled();
      s.detach();
      drop();
      s.attach();
      expect(onRender).toHaveBeenCalledTimes(1);
    });

    it("attach without hass does not render", () => {
      const { s, onRender } = make();
      s.configure(cfg());
      s.attach();
      expect(onRender).not.toHaveBeenCalled();
    });

    it("setHass while detached records hass without rendering", () => {
      const { s, onRender } = make();
      const { hass } = mkHass();
      s.configure(cfg());
      s.detach();
      s.setHass(hass);
      expect(onRender).not.toHaveBeenCalled();
    });

    it("lazy_refresh 0 renders immediately on a changed tracked state", async () => {
      const { s, onRender } = make();
      const { hass } = mkHass();
      s.configure(cfg({ lazy_refresh: 0 }));
      s.setHass(hass);
      onRender.mockClear();
      s.setHass(mk("1"));
      expect(onRender).toHaveBeenCalledTimes(1);
    });

    it("debug mode reports events and filtered renders, and ticks the overlay", async () => {
      const onDebug = vi.fn();
      const onDebugTick = vi.fn();
      const { s } = make({ onDebug, onDebugTick });
      const { hass } = mkHass();
      s.configure(cfg({ debug: true }));
      s.setHass(hass);
      s.setHass(mk("1"));
      expect(onDebug).toHaveBeenCalledWith("events");
      expect(onDebug).toHaveBeenCalledWith("filtered");
      await vi.advanceTimersByTimeAsync(1000);
      expect(onDebugTick).toHaveBeenCalledTimes(1);
    });

    it("debug mode works without optional hooks", async () => {
      const { s } = make();
      const { hass } = mkHass();
      s.configure(cfg({ debug: true }));
      s.setHass(hass);
      s.setHass(mk("1"));
      await vi.advanceTimersByTimeAsync(10_000);
    });

    it("fixed_refresh timer renders periodically", async () => {
      const { s, onRender } = make();
      s.configure(cfg({ fixed_refresh: 10 }));
      s.setHass(mkHass().hass);
      onRender.mockClear();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(onRender).toHaveBeenCalledTimes(1);
    });

    it("timers do nothing once hass is gone", async () => {
      const { s, onRender } = make();
      s.configure(cfg({ fixed_refresh: 10, debug: true }));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(onRender).not.toHaveBeenCalled();
    });

    it("renders on a changed tracked state at lazy_refresh 0", () => {
      const onRender = vi.fn(() => {
        s.refreshTracked(["sensor.nba_lal"]);
      });
      const s = new RefreshScheduler({ onRender });
      s.configure({
        fixed_refresh: 0,
        lazy_refresh: 0,
        sections: [{ prefix: "sensor.nba_" }],
      } as unknown as CardConfig);
      const mk = (state: string) =>
        ({ states: { "sensor.nba_lal": { state } } }) as unknown as HomeAssistant;
      s.setHass(mk("PRE"));
      s.setHass(mk("IN"));
      expect(onRender).toHaveBeenCalledTimes(2);
    });
  });
});
