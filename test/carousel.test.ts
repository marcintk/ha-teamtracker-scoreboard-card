import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { Carousel } from "../src/carousel.js";
import type { SectionConfig } from "../src/types.js";
import { useFakeTimers } from "./helpers.js";

describe("Carousel", () => {
  useFakeTimers();

  it("advances on the slide timer, wraps on step(-1), and pauses", () => {
    const onChange = vi.fn();
    const c = new Carousel(onChange, () => false);
    const sections: SectionConfig[] = [{ name: "a" }, { name: "b" }, { name: "c" }];
    c.configure({ mode: "slide", slide_sec: 10, sections });
    expect(c.active).toBe(true);
    expect(c.index).toBe(0);
    expect(c.paused).toBe(false);

    c.sync();
    vi.advanceTimersByTime(10_000);
    expect(c.index).toBe(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    c.step(-1);
    expect(c.index).toBe(0);
    expect(c.paused).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(30_000);
    expect(c.index).toBe(0);
  });

  const secs = (n: number): SectionConfig[] =>
    Array.from({ length: n }, (_, i) => ({ name: `s${i}` }));
  const make = (cfg: Parameters<Carousel["configure"]>[0], reduced = false) => {
    const onChange = vi.fn();
    const c = new Carousel(onChange, () => reduced);
    c.configure(cfg);
    return { c, onChange };
  };

  it("arms no timer for a single section or non-slide mode", () => {
    make({ mode: "slide", sections: secs(1) }).c.sync();
    expect(vi.getTimerCount()).toBe(0);
    const { c } = make({ sections: secs(3) });
    c.sync();
    expect(c.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sync is idempotent while running and stop halts ticks", () => {
    const { c, onChange } = make({ mode: "slide", slide_sec: 10, sections: secs(2) });
    c.sync();
    vi.advanceTimersByTime(6000);
    c.sync();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(4000);
    expect(onChange).toHaveBeenCalledTimes(1);
    c.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("sync stops a running timer once paused", () => {
    const { c } = make({ mode: "slide", sections: secs(2) });
    c.sync();
    c.toggle();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to 45s for a missing, zero or negative slide_sec", () => {
    for (const slide_sec of [undefined, 0, -5]) {
      const { c, onChange } = make({ mode: "slide", slide_sec, sections: secs(2) });
      c.sync();
      vi.advanceTimersByTime(44_999);
      expect(onChange).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onChange).toHaveBeenCalledTimes(1);
      c.stop();
    }
  });

  it("starts paused under reduced motion, and toggle resumes and syncs before onChange", () => {
    const onChange = vi.fn();
    const c = new Carousel(
      () => onChange(vi.getTimerCount()),
      () => true
    );
    c.configure({ mode: "slide", sections: secs(2) });
    c.sync();
    expect(c.paused).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    c.toggle();
    expect(c.paused).toBe(false);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("step wraps forward and is a no-op below two sections", () => {
    const { c, onChange } = make({ mode: "slide", sections: secs(2) });
    c.step(1);
    c.step(1);
    expect(c.index).toBe(0);
    const one = make({ mode: "slide", sections: secs(1) });
    one.c.step(1);
    expect(one.c.paused).toBe(false);
    expect(one.onChange).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("configure(null) zeroes the count and resets index", () => {
    const { c } = make({ mode: "slide", sections: secs(3) });
    c.step(1);
    c.configure(null);
    expect(c.active).toBe(false);
    expect(c.index).toBe(0);
  });

  it("controls() is empty when inactive and clickable when active", () => {
    const off = make({ sections: secs(3) });
    const host = document.createElement("div");
    render(off.c.controls(), host);
    expect(host.querySelector(".slide-btn")).toBeNull();

    const { c, onChange } = make({ mode: "slide", sections: secs(3) });
    render(c.controls(), host);
    const btns = host.querySelectorAll<HTMLButtonElement>(".slide-btn");
    expect(btns).toHaveLength(3);
    btns[2]?.click();
    expect(c.index).toBe(1);
    btns[1]?.click();
    expect(c.paused).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
    render(c.controls(), host);
    expect(host.querySelector(".slide-ctrls")?.classList.contains("paused")).toBe(false);
  });
});
