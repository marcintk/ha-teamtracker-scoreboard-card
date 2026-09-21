import { describe, expect, it, vi } from "vitest";
import { SubscriptionManager } from "../../src/lifecycle/subscription.js";

type SubscribeCallback = (event: { data: { entity_id: string } }) => void;
const getCallback = (fn: ReturnType<typeof vi.fn>): SubscribeCallback =>
  (fn.mock.calls as [[SubscribeCallback]])[0][0];

function makeConnection(resolvedUnsub = vi.fn()) {
  return {
    connection: { subscribeEvents: vi.fn().mockResolvedValue(resolvedUnsub) },
    unsub: resolvedUnsub,
  };
}

describe("SubscriptionManager", () => {
  describe("subscribe", () => {
    it("calls subscribeEvents on the connection", async () => {
      const mgr = new SubscriptionManager();
      const { connection } = makeConnection();
      mgr.subscribe(connection, new Set(["sensor.a"]), vi.fn());
      await Promise.resolve();
      expect(connection.subscribeEvents).toHaveBeenCalledWith(
        expect.any(Function),
        "state_changed"
      );
    });

    it("is active after the promise resolves", async () => {
      const mgr = new SubscriptionManager();
      const { connection } = makeConnection();
      mgr.subscribe(connection, new Set(["sensor.a"]), vi.fn());
      await Promise.resolve();
      expect(mgr.active).toBe(true);
    });

    it("fires onMatch when the event entity is in trackedIds", async () => {
      const mgr = new SubscriptionManager();
      const { connection } = makeConnection();
      const onMatch = vi.fn();
      mgr.subscribe(connection, new Set(["sensor.a"]), onMatch);
      await Promise.resolve();
      const cb = getCallback(connection.subscribeEvents);
      cb({ data: { entity_id: "sensor.a" } });
      expect(onMatch).toHaveBeenCalledTimes(1);
    });

    it("does not fire onMatch for an entity not in trackedIds", async () => {
      const mgr = new SubscriptionManager();
      const { connection } = makeConnection();
      const onMatch = vi.fn();
      mgr.subscribe(connection, new Set(["sensor.a"]), onMatch);
      await Promise.resolve();
      const cb = getCallback(connection.subscribeEvents);
      cb({ data: { entity_id: "sensor.b" } });
      expect(onMatch).not.toHaveBeenCalled();
    });

    it("does not fire onMatch when trackedIds is null", async () => {
      const mgr = new SubscriptionManager();
      const { connection } = makeConnection();
      const onMatch = vi.fn();
      mgr.subscribe(connection, null, onMatch);
      await Promise.resolve();
      const cb = getCallback(connection.subscribeEvents);
      cb({ data: { entity_id: "sensor.a" } });
      expect(onMatch).not.toHaveBeenCalled();
    });

    it("does nothing when connection has no subscribeEvents", () => {
      const mgr = new SubscriptionManager();
      expect(() => mgr.subscribe({}, new Set(), vi.fn())).not.toThrow();
      expect(mgr.active).toBe(false);
    });

    it("does nothing when connection is null", () => {
      const mgr = new SubscriptionManager();
      expect(() => mgr.subscribe(null, new Set(), vi.fn())).not.toThrow();
      expect(mgr.active).toBe(false);
    });

    it("does nothing when connection is undefined", () => {
      const mgr = new SubscriptionManager();
      expect(() => mgr.subscribe(undefined, new Set(), vi.fn())).not.toThrow();
      expect(mgr.active).toBe(false);
    });

    it("silently ignores subscribeEvents rejection", async () => {
      const mgr = new SubscriptionManager();
      const connection = { subscribeEvents: vi.fn().mockRejectedValue(new Error("ws error")) };
      mgr.subscribe(connection, new Set(), vi.fn());
      await Promise.resolve();
      await Promise.resolve();
      expect(mgr.active).toBe(false);
    });
  });

  describe("clear", () => {
    it("calls unsub and deactivates", async () => {
      const mgr = new SubscriptionManager();
      const { connection, unsub } = makeConnection();
      mgr.subscribe(connection, new Set(), vi.fn());
      await Promise.resolve();
      mgr.clear();
      expect(unsub).toHaveBeenCalledTimes(1);
      expect(mgr.active).toBe(false);
    });

    it("does not throw when called before any subscription", () => {
      const mgr = new SubscriptionManager();
      expect(() => mgr.clear()).not.toThrow();
    });

    it("stale callback after clear does not call onMatch", async () => {
      const mgr = new SubscriptionManager();
      const { connection } = makeConnection();
      const onMatch = vi.fn();
      mgr.subscribe(connection, new Set(["sensor.a"]), onMatch);
      await Promise.resolve();
      const staleCallback = getCallback(connection.subscribeEvents);
      mgr.clear();
      staleCallback({ data: { entity_id: "sensor.a" } });
      expect(onMatch).not.toHaveBeenCalled();
    });

    it("stale promise after clear calls unsub immediately", async () => {
      const mgr = new SubscriptionManager();
      const { connection, unsub } = makeConnection();
      mgr.subscribe(connection, new Set(), vi.fn());
      mgr.clear();
      await Promise.resolve();
      expect(unsub).toHaveBeenCalledTimes(1);
      expect(mgr.active).toBe(false);
    });
  });

  describe("active", () => {
    it("returns false before subscription", () => {
      const mgr = new SubscriptionManager();
      expect(mgr.active).toBe(false);
    });

    it("returns true after subscription resolves", async () => {
      const mgr = new SubscriptionManager();
      const { connection } = makeConnection();
      mgr.subscribe(connection, new Set(), vi.fn());
      await Promise.resolve();
      expect(mgr.active).toBe(true);
    });

    it("returns false after clear", async () => {
      const mgr = new SubscriptionManager();
      const { connection } = makeConnection();
      mgr.subscribe(connection, new Set(), vi.fn());
      await Promise.resolve();
      mgr.clear();
      expect(mgr.active).toBe(false);
    });
  });
});
