import { describe, expect, it, vi } from "vitest";
import { CancelableSubscription } from "../src/subscription.js";

type SubscribeCallback = (event: { data: { entity_id: string } }) => void;
const getCallback = (fn: ReturnType<typeof vi.fn>): SubscribeCallback =>
  (fn.mock.calls as [[SubscribeCallback]])[0][0];

function makeConnection(resolvedUnsub = vi.fn()) {
  return {
    connection: { subscribeEvents: vi.fn().mockResolvedValue(resolvedUnsub) },
    unsub: resolvedUnsub,
  };
}

describe("CancelableSubscription", () => {
  describe("subscribe", () => {
    it("calls subscribeEvents on the connection", async () => {
      const sub = new CancelableSubscription();
      const { connection } = makeConnection();
      sub.subscribe(connection, new Set(["sensor.a"]), vi.fn());
      await Promise.resolve();
      expect(connection.subscribeEvents).toHaveBeenCalledWith(
        expect.any(Function),
        "state_changed"
      );
    });

    it("is active after the promise resolves", async () => {
      const sub = new CancelableSubscription();
      const { connection } = makeConnection();
      sub.subscribe(connection, new Set(["sensor.a"]), vi.fn());
      await Promise.resolve();
      expect(sub.active).toBe(true);
    });

    it("fires onMatch when the event entity is in trackedIds", async () => {
      const sub = new CancelableSubscription();
      const { connection } = makeConnection();
      const onMatch = vi.fn();
      sub.subscribe(connection, new Set(["sensor.a"]), onMatch);
      await Promise.resolve();
      const cb = getCallback(connection.subscribeEvents);
      cb({ data: { entity_id: "sensor.a" } });
      expect(onMatch).toHaveBeenCalledTimes(1);
    });

    it("does not fire onMatch for an entity not in trackedIds", async () => {
      const sub = new CancelableSubscription();
      const { connection } = makeConnection();
      const onMatch = vi.fn();
      sub.subscribe(connection, new Set(["sensor.a"]), onMatch);
      await Promise.resolve();
      const cb = getCallback(connection.subscribeEvents);
      cb({ data: { entity_id: "sensor.b" } });
      expect(onMatch).not.toHaveBeenCalled();
    });

    it("does not fire onMatch when trackedIds is null", async () => {
      const sub = new CancelableSubscription();
      const { connection } = makeConnection();
      const onMatch = vi.fn();
      sub.subscribe(connection, null, onMatch);
      await Promise.resolve();
      const cb = getCallback(connection.subscribeEvents);
      cb({ data: { entity_id: "sensor.a" } });
      expect(onMatch).not.toHaveBeenCalled();
    });

    it("does nothing when connection has no subscribeEvents", () => {
      const sub = new CancelableSubscription();
      expect(() => sub.subscribe({}, new Set(), vi.fn())).not.toThrow();
      expect(sub.active).toBe(false);
    });

    it("does nothing when connection is null", () => {
      const sub = new CancelableSubscription();
      expect(() => sub.subscribe(null, new Set(), vi.fn())).not.toThrow();
      expect(sub.active).toBe(false);
    });

    it("does nothing when connection is undefined", () => {
      const sub = new CancelableSubscription();
      expect(() => sub.subscribe(undefined, new Set(), vi.fn())).not.toThrow();
      expect(sub.active).toBe(false);
    });

    it("silently ignores subscribeEvents rejection", async () => {
      const sub = new CancelableSubscription();
      const connection = { subscribeEvents: vi.fn().mockRejectedValue(new Error("ws error")) };
      sub.subscribe(connection, new Set(), vi.fn());
      await Promise.resolve();
      await Promise.resolve();
      expect(sub.active).toBe(false);
    });
  });

  describe("clear", () => {
    it("calls unsub and deactivates", async () => {
      const sub = new CancelableSubscription();
      const { connection, unsub } = makeConnection();
      sub.subscribe(connection, new Set(), vi.fn());
      await Promise.resolve();
      sub.clear();
      expect(unsub).toHaveBeenCalledTimes(1);
      expect(sub.active).toBe(false);
    });

    it("does not throw when called before any subscription", () => {
      const sub = new CancelableSubscription();
      expect(() => sub.clear()).not.toThrow();
    });

    it("stale callback after clear does not call onMatch", async () => {
      const sub = new CancelableSubscription();
      const { connection } = makeConnection();
      const onMatch = vi.fn();
      sub.subscribe(connection, new Set(["sensor.a"]), onMatch);
      await Promise.resolve();
      const staleCallback = getCallback(connection.subscribeEvents);
      sub.clear();
      staleCallback({ data: { entity_id: "sensor.a" } });
      expect(onMatch).not.toHaveBeenCalled();
    });

    it("stale promise after clear calls unsub immediately", async () => {
      const sub = new CancelableSubscription();
      const { connection, unsub } = makeConnection();
      sub.subscribe(connection, new Set(), vi.fn());
      sub.clear();
      await Promise.resolve();
      expect(unsub).toHaveBeenCalledTimes(1);
      expect(sub.active).toBe(false);
    });
  });

  describe("active", () => {
    it("returns false before subscription", () => {
      const sub = new CancelableSubscription();
      expect(sub.active).toBe(false);
    });

    it("returns true after subscription resolves", async () => {
      const sub = new CancelableSubscription();
      const { connection } = makeConnection();
      sub.subscribe(connection, new Set(), vi.fn());
      await Promise.resolve();
      expect(sub.active).toBe(true);
    });

    it("returns false after clear", async () => {
      const sub = new CancelableSubscription();
      const { connection } = makeConnection();
      sub.subscribe(connection, new Set(), vi.fn());
      await Promise.resolve();
      sub.clear();
      expect(sub.active).toBe(false);
    });
  });
});
