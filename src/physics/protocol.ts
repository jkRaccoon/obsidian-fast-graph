import type { ForceParams } from "../types";

export type MainToWorker =
  | { type: "init"; count: number; edges: ArrayBuffer; positions: ArrayBuffer; groupId: ArrayBuffer; params: ForceParams }
  | { type: "setParams"; params: Partial<ForceParams> }
  | { type: "pin"; index: number; x: number; y: number; z: number }
  | { type: "unpin"; index: number }
  | { type: "reheat" }
  | { type: "stop" };

export type WorkerToMain =
  | { type: "tick"; positions: ArrayBuffer; alpha: number }
  | { type: "stopped" }
  | { type: "error"; message: string };

export function initMessage(
  count: number,
  edges: Int32Array,
  positions: Float32Array,
  groupId: Uint16Array,
  params: ForceParams
): { msg: Extract<MainToWorker, { type: "init" }>; transfer: ArrayBuffer[] } {
  // 복사본을 만들어 호출자 버퍼를 detach 시키지 않는다.
  const edgesCopy = edges.slice();
  const posCopy = positions.slice();
  const groupCopy = groupId.slice();
  return {
    msg: { type: "init", count, edges: edgesCopy.buffer, positions: posCopy.buffer, groupId: groupCopy.buffer, params },
    transfer: [edgesCopy.buffer, posCopy.buffer, groupCopy.buffer],
  };
}
