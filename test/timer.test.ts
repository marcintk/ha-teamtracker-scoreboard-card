import { describe, expect, it, vi } from "vitest";
import { CancelableTimer } from "../src/timer.js";
import { useFakeTimers } from "./helpers.js";

describe("CancelableTimer", () => {
  useFakeTimers();

  describe("start", () => {
    it("fires repeatedly at the given interval", () => {
      const timer = new CancelableTimer();
      const fn = vi.fn();
      timer.start(1000, fn);
      expect(timer.active).toBe(true);
      vi.advanceTimersByTime(3000);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("replaces an already-running interval instead of stacking a second one", () => {
      const timer = new CancelableTimer();
      const fn = vi.fn();
      timer.start(1000, fn);
      vi.advanceTimersByTime(500);
      timer.start(1000, fn);
      vi.advanceTimersByTime(500);
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(500);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("replaces an already-armed one-shot timeout", () => {
      const timer = new CancelableTimer();
      const fn = vi.fn();
      timer.armOnce(1000, fn);
      timer.start(500, fn);
      vi.advanceTimersByTime(500);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("armOnce", () => {
    it("fires once, then clears itself", () => {
      const timer = new CancelableTimer();
      const fn = vi.fn();
      timer.armOnce(1000, fn);
      expect(timer.active).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(timer.active).toBe(false);
    });

    it("is a no-op while a timeout is already armed", () => {
      const timer = new CancelableTimer();
      const fn = vi.fn();
      timer.armOnce(1000, fn);
      timer.armOnce(500, fn);
      vi.advanceTimersByTime(500);
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(500);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("is a no-op while an interval is already running", () => {
      const timer = new CancelableTimer();
      const intervalFn = vi.fn();
      const onceFn = vi.fn();
      timer.start(1000, intervalFn);
      timer.armOnce(500, onceFn);
      vi.advanceTimersByTime(1000);
      expect(onceFn).not.toHaveBeenCalled();
      expect(intervalFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("stop", () => {
    it("cancels a running interval", () => {
      const timer = new CancelableTimer();
      const fn = vi.fn();
      timer.start(1000, fn);
      timer.stop();
      expect(timer.active).toBe(false);
      vi.advanceTimersByTime(5000);
      expect(fn).not.toHaveBeenCalled();
    });

    it("cancels an armed timeout", () => {
      const timer = new CancelableTimer();
      const fn = vi.fn();
      timer.armOnce(1000, fn);
      timer.stop();
      expect(timer.active).toBe(false);
      vi.advanceTimersByTime(5000);
      expect(fn).not.toHaveBeenCalled();
    });

    it("is a no-op when nothing is running", () => {
      const timer = new CancelableTimer();
      expect(() => timer.stop()).not.toThrow();
      expect(timer.active).toBe(false);
    });
  });
});
