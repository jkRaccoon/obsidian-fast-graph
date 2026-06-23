import type { GraphModel } from "../data/GraphModel";

export function neighborsOf(model: GraphModel, index: number): Set<number> {
  const result = new Set<number>([index]);
  for (let e = 0; e < model.edgeCount; e++) {
    const a = model.edges[e * 2];
    const b = model.edges[e * 2 + 1];
    if (a === index) result.add(b);
    else if (b === index) result.add(a);
  }
  return result;
}
