import type { ResolvedLinks } from "./GraphModel";

// Obsidian "제외할 파일"(userIgnoreFilters) 매칭 규칙을 재현한다:
// - `/패턴/` 형태는 정규식으로 path에 대해 test.
// - 그 외는 대소문자 무시 부분일치(폴더 경로 "scripts/" 등).
const REGEX_FORM = /^\/(.*)\/$/;

export function isExcluded(path: string, filters: string[]): boolean {
  if (!filters || filters.length === 0) return false;
  const lower = path.toLowerCase();
  for (const filter of filters) {
    if (!filter) continue;
    const m = filter.match(REGEX_FORM);
    if (m) {
      try {
        if (new RegExp(m[1]).test(path)) return true;
      } catch {
        // 잘못된 정규식은 무시
      }
    } else if (lower.includes(filter.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/** 제외 대상 source/target을 모두 떨어낸 새 resolvedLinks를 반환한다. 필터가 없으면 원본 그대로. */
export function filterResolvedLinks(links: ResolvedLinks, filters: string[]): ResolvedLinks {
  if (!filters || filters.length === 0) return links;
  const out: ResolvedLinks = {};
  for (const source of Object.keys(links)) {
    if (isExcluded(source, filters)) continue;
    const targets = links[source];
    const kept: Record<string, number> = {};
    for (const target of Object.keys(targets)) {
      if (isExcluded(target, filters)) continue;
      kept[target] = targets[target];
    }
    out[source] = kept;
  }
  return out;
}
