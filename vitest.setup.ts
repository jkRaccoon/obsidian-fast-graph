// Obsidian 플러그인은 브라우저(Electron renderer)에서 동작하므로 코드가
// window.setTimeout 등 window 전역을 사용한다. vitest는 node 환경이라 window가
// 없으므로, 테스트에서 window를 globalThis로 별칭 처리한다.
if (typeof (globalThis as { window?: unknown }).window === "undefined") {
  (globalThis as { window?: unknown }).window = globalThis;
}
