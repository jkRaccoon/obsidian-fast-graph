import type { GraphModel } from "../data/GraphModel";

export function extractLocalGraph(
  model: GraphModel,
  rootPath: string,
  depth: number
): Set<number> {
  const root = model.pathToIndex.get(rootPath);
  if (root === undefined) return new Set();

  // 인접 리스트 (무방향)
  const adj: number[][] = Array.from({ length: model.count }, () => []);
  for (let e = 0; e < model.edgeCount; e++) {
    const s = model.edges[e * 2];
    const t = model.edges[e * 2 + 1];
    adj[s].push(t);
    adj[t].push(s);
  }

  const visited = new Set<number>([root]);
  let frontier = [root];
  for (let d = 0; d < depth; d++) {
    const next: number[] = [];
    for (const u of frontier) {
      for (const v of adj[u]) {
        if (!visited.has(v)) {
          visited.add(v);
          next.push(v);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return visited;
}
