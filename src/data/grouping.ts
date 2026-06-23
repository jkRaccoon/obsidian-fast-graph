import type { GroupBy } from "../types";

export const PALETTE: string[] = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
];

export interface GroupingResult {
  groupId: Uint16Array;
  groups: { id: number; key: string; color: string }[];
}

function keyFor(path: string, tagsByPath: Map<string, string[]>, mode: GroupBy): string {
  if (mode === "none") return "all";
  if (mode === "folder") {
    const slash = path.indexOf("/");
    return slash === -1 ? "/" : path.slice(0, slash);
  }
  // tag
  const tags = tagsByPath.get(path);
  return tags && tags.length > 0 ? tags[0] : "(untagged)";
}

export function computeGrouping(
  paths: string[],
  tagsByPath: Map<string, string[]>,
  mode: GroupBy
): GroupingResult {
  const groupId = new Uint16Array(paths.length);
  const keyToId = new Map<string, number>();
  const groups: { id: number; key: string; color: string }[] = [];

  for (let i = 0; i < paths.length; i++) {
    const key = keyFor(paths[i], tagsByPath, mode);
    let id = keyToId.get(key);
    if (id === undefined) {
      id = groups.length;
      keyToId.set(key, id);
      groups.push({ id, key, color: PALETTE[id % PALETTE.length] });
    }
    groupId[i] = id;
  }
  return { groupId, groups };
}
