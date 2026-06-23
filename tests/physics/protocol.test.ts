import { describe, it, expect } from "vitest";
import { initMessage } from "../../src/physics/protocol";

describe("protocol", () => {
  it("initMessage packs buffers as transferable ArrayBuffers", () => {
    const positions = new Float32Array([1, 2, 3]);
    const edges = Int32Array.from([0, 1]);
    const groupId = Uint16Array.from([0]);
    const { msg, transfer } = initMessage(1, edges, positions, groupId, {
      repulsion: 1, linkStrength: 1, linkDistance: 1, gravity: 1, damping: 1, theta: 1,
      groupCohesion: 0.1, groupSeparation: 100,
    });
    expect(msg.type).toBe("init");
    expect(msg.count).toBe(1);
    expect(transfer.length).toBe(3);
    expect(transfer[0]).toBeInstanceOf(ArrayBuffer);
  });
});
