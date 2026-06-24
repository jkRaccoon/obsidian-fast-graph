# Task 1 Report: AssemblyScript 툴체인 + base64 워커 번들링

## 구현 요약

AssemblyScript 툴체인을 설치하고 `assembly/physics.ts`를 컴파일해 `build/physics.wasm`을 생성. esbuild 워커 번들에 `process.env.PHYSICS_WASM_B64` define을 주입하도록 설정. 스모크 테스트로 wasm 인스턴스화 및 `add(2,3)===5` 검증 완료.

## 사용한 asc 플래그

```
asc assembly/physics.ts --outFile build/physics.wasm --optimize --exportRuntime
```

- `--target release` 대신 플래그 직접 지정 (asconfig.json 없이 standalone 동작)
- `--optimize`: 최적화 활성화
- `--exportRuntime`: 후속 태스크에서 typed array 할당을 위해 필요 (`__new`, `__pin`, `__unpin`, `__collect` 익스포트됨)

## TDD RED/GREEN 증거

### RED (Step 7 이전)

```
$ yarn vitest run tests/physics/wasm-smoke.test.ts
FAIL tests/physics/wasm-smoke.test.ts > wasm toolchain
Error: ENOENT: no such file or directory, open 'build/physics.wasm'
Test Files  1 failed (1)
Tests  1 skipped (1)
```

### GREEN (Step 8 이후)

```
$ yarn asbuild && yarn vitest run tests/physics/wasm-smoke.test.ts
✓ tests/physics/wasm-smoke.test.ts (1 test) 2ms
Test Files  1 passed (1)
Tests  1 passed (1)
Duration  344ms
```

## 발견된 문제 및 조정

### `env.abort` import 필요

`--exportRuntime` 플래그 사용 시 wasm이 `env.abort` 함수를 import 요구함.  
브리프의 테스트 코드는 `{}` 빈 imports를 전달했으나 `TypeError: WebAssembly.instantiate(): Import #0 "env": module is not an object or function` 오류 발생.  

**해결:** `tests/physics/wasm-smoke.test.ts`의 `beforeAll`에 `env.abort` 구현 추가:
```ts
const imports = {
  env: {
    abort: (_msg, _file, _line, _col) => { throw new Error("wasm abort"); },
  },
};
```

이는 후속 태스크에서도 실제 wasm 통합 시 필요한 패턴이므로 적절한 조정임.

### `yarn build` 후 `main.js`에 `AGFzbQ` 미포함

`process.env.PHYSICS_WASM_B64`가 esbuild `define`에 등록됐으나, 현재 `src/physics/physics.worker.ts`가 이 환경변수를 아직 참조하지 않음. define은 사용 시 인라인되므로, worker가 실제로 참조할 때(Task 2)부터 main.js에 base64가 포함됨. 빌드 자체는 에러 없이 완료됨.

## 변경된 파일

| 파일 | 변경 내용 |
|------|-----------|
| `package.json` | `assemblyscript@^0.27.0` devDep 추가, `asbuild` 스크립트 추가, `build`/`dev` 선행 `yarn asbuild &&` 추가 |
| `yarn.lock` | assemblyscript 0.27.37, binaryen 116.0.0-nightly, long 5.3.2 추가 |
| `assembly/tsconfig.json` | 신규 생성, `assemblyscript/std/assembly.json` extends |
| `assembly/physics.ts` | 신규 생성, 트리비얼 `add(a,b)` 함수 |
| `esbuild.config.mjs` | `node:fs` import 추가, `wasmB64` 상단 선언, `buildWorker()` define에 `PHYSICS_WASM_B64` 추가 |
| `.gitignore` | `build/` 추가 |
| `tests/physics/wasm-smoke.test.ts` | 신규 생성, wasm 인스턴스화 + add(2,3)===5 검증 |

## 자가 검토

- yarn-only: 모든 명령 `yarn` 사용, `npm` 미사용
- 브랜치: `feat/wasm-physics` (올바름)
- `buildMain`/실행부 보존: esbuild.config.mjs 하단부 변경 없음
- `tsconfig.json`의 `include: ["src","tests"]` 유지: assembly/ 는 asc로만 컴파일
- `build/` gitignore: 추가됨
- 스트레이 파일 없음
- 커밋: `b2f324b build: AssemblyScript 툴체인 + wasm base64 워커 임베드`

## 주의 사항 (후속 태스크)

1. Task 2에서 worker가 `process.env.PHYSICS_WASM_B64`를 실제로 읽을 때, `env.abort` 구현 + 워커 내 imports 객체 설정이 필요함
2. `--exportRuntime` 익스포트(`__new`, `__pin` 등)는 GC managed memory 사용 시 필요하며, 단순 i32 연산에는 불필요하지만 후속 호환성을 위해 유지

## Fix: esbuild wasm 읽기 견고성

`build/physics.wasm`의 `readFileSync` 호출을 모듈 최상단에서 `buildWorker()` 함수 내부로 이동하고, 파일 누락 시 명확한 오류 메시지를 던지도록 개선.

### 변경 내용

`esbuild.config.mjs`의 7번 줄:
```js
// Before
const wasmB64 = readFileSync("build/physics.wasm").toString("base64");

// After (buildWorker 내부)
if (!existsSync("build/physics.wasm")) {
  throw new Error(
    "build/physics.wasm 없음 — 먼저 `yarn asbuild`를 실행하세요."
  );
}
const wasmB64 = readFileSync("build/physics.wasm").toString("base64");
```

**효과:** 누군가 `yarn asbuild` 없이 `node esbuild.config.mjs` 실행 시, 원인을 명확히 하는 에러 메시지 표시. 이전에는 raw ENOENT 예외만 출력됨.

### 검증

```
$ yarn build
✓ (완료, 오류 없음)

$ yarn asbuild && yarn vitest run tests/physics/wasm-smoke.test.ts
✓ tests/physics/wasm-smoke.test.ts (1 test) 1ms
Test Files  1 passed (1)
Tests  1 passed (1)
Duration  336ms
```

두 명령 모두 성공 확인.
