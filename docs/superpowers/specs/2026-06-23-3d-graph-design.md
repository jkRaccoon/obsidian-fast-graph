---
title: Obsidian Fast 3D Graph — 설계 문서
date: 2026-06-23
status: approved
tags: [obsidian-plugin, 3d-graph, design-spec]
---

# Obsidian Fast 3D Graph — 설계 문서

## 1. 개요

Obsidian의 기본 그래프 뷰를 **3D 공간**에서 **빠르고 가볍게** 보여주는 플러그인.
핵심 차별점은 **성능**: 기본 그래프가 버벅이는 대규모 vault(~10,000 노드)를
부드럽게(체감 60fps에 가깝게) 탐색하는 것이 목표다.

### 핵심 결정 사항

| 항목 | 결정 |
|---|---|
| 핵심 지향 | 대규모 vault 탐색 도구 (성능 = 차별점) |
| 목표 규모 | ~10,000 노드에서 부드러운 실시간 동작 |
| 레이아웃 | 실시간 물리 시뮬레이션 (Web Worker, Barnes-Hut) |
| 렌더링/물리 스택 | Three.js(커스텀 렌더러) + 자체 워커 물리 엔진 |
| 위치 공유 | double-buffered transferable 기본, SharedArrayBuffer 가능 시 무복사 |
| 빌드 | TypeScript + esbuild, 패키지 매니저 yarn |

## 2. 아키텍처

3개 레이어를 **스레드 단위로 분리**한다. 물리(워커)와 렌더(메인)를 디커플링해
시뮬레이션이 도는 중에도 카메라/화면이 끊기지 않게 한다.

```
┌─────────────────────────────────────────────────────────────┐
│  Obsidian 메인 스레드                                          │
│                                                               │
│  ┌──────────────┐   resolvedLinks    ┌──────────────────┐    │
│  │ GraphData    │──── 이벤트 구독 ───▶│  GraphModel       │    │
│  │ Provider     │   (rename/del/...)  │  (typed arrays)   │    │
│  └──────────────┘                     └────────┬─────────┘    │
│         ▲ metadataCache                         │ topology     │
│         │                                       ▼ (transfer)   │
│  ┌──────┴───────┐                     ┌──────────────────┐    │
│  │ Obsidian API │                     │  Render Layer     │    │
│  │ vault/leaf   │◀── openFile() ──────│  (Three.js)       │    │
│  └──────────────┘    클릭 시           │  InstancedMesh    │    │
│                                        │  + LineSegments   │    │
│  ┌──────────────────────────────┐     │  + OrbitControls  │    │
│  │ Interaction (hover/click/drag)│◀───▶│  + Raycaster      │    │
│  └──────────────────────────────┘     └────────▲─────────┘    │
│                                                 │ position buf  │
└─────────────────────────────────────────────────┼─────────────┘
                                                   │ (double-buffer
              postMessage / SharedArrayBuffer      │  또는 SAB)
                                                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Web Worker (물리 스레드)                                      │
│  PhysicsEngine: Barnes-Hut octree(척력) + spring(인력)         │
│                + centering/gravity + Verlet 적분 + alpha decay │
│  → 매 tick 위치 버퍼를 메인으로 전송, 안정되면 자동 정지         │
└─────────────────────────────────────────────────────────────┘
```

### 데이터 흐름

1. `GraphDataProvider`가 `app.metadataCache.resolvedLinks`를 읽어 노드/엣지를
   typed array(위치·속도·색상그룹·degree)로 빌드. vault의 create/rename/delete 및
   `metadataCache.on('resolved')` 이벤트를 구독해 증분 갱신.
2. 토폴로지를 워커로 전송(transferable) → 워커가 force 시뮬레이션을 자체 tick rate로 구동.
3. 워커는 매 tick 위치 버퍼만 메인으로 전송. 메인의 렌더 루프(`requestAnimationFrame`)는
   최신 버퍼를 읽어 InstancedMesh 인스턴스 행렬만 갱신 — 물리와 디커플링.
4. 사용자 상호작용(hover/click/drag)은 메인에서 raycast로 처리, 노드 드래그/핀은
   워커로 제어 메시지 전송. 클릭 시 `workspace.openFile`.
5. 안정화(alpha decay)되면 워커 tick을 멈춰 idle 시 CPU 0 — "라이트"의 핵심.

## 3. 컴포넌트 분해 (모듈/파일 구조)

각 모듈이 단일 책임을 갖고 잘 정의된 인터페이스로만 소통한다. 물리/데이터/렌더 핵심
모듈은 Obsidian API 의존이 없어 독립 테스트가 가능하다.

```
src/
├── main.ts                  # 플러그인 진입점: 뷰/리본/커맨드/설정 등록
├── settings.ts              # 설정 탭 UI + 기본값 + load/saveData
├── view/
│   └── Graph3DView.ts       # ItemView 구현, 레이어들을 조립·생명주기 관리
│
├── data/
│   ├── GraphDataProvider.ts # metadataCache → 이벤트 구독, 증분 갱신 오케스트레이션
│   ├── GraphModel.ts        # typed array 그래프 모델(노드/엣지/인덱스 매핑)
│   └── grouping.ts          # 폴더/태그 → 색상 그룹 id 매핑 + 팔레트
│
├── physics/
│   ├── physics.worker.ts    # 워커 진입점: 메시지 핸들링 + tick 루프
│   ├── PhysicsEngine.ts     # force 시뮬레이션(순수 함수형, 프레임워크 무관)
│   ├── Octree.ts            # Barnes-Hut 8분 트리(척력 근사)
│   └── protocol.ts          # 메인↔워커 메시지 타입(공유 계약)
│
├── render/
│   ├── GraphRenderer.ts     # Three.js 씬/카메라/루프 총괄
│   ├── NodeLayer.ts         # InstancedMesh 노드(색상·크기·행렬 갱신)
│   ├── EdgeLayer.ts         # LineSegments 엣지(위치 attribute 갱신)
│   ├── LabelLayer.ts        # 호버/상위 degree 라벨(CSS2D 오버레이)
│   └── Picker.ts            # raycast 기반 hover/click 피킹
│
├── interaction/
│   ├── controls.ts          # OrbitControls 래핑 + 카메라 동작
│   ├── hover.ts             # 호버 → 라벨/이웃 하이라이트
│   └── localGraph.ts        # 활성 노트 기준 BFS depth-N 서브그래프 추출
│
└── types.ts                 # 공용 타입
```

### 핵심 인터페이스 / 계약

- **`GraphModel`** — 노드 `count`, `positions: Float32Array(3n)`, `velocities`,
  `groupId: Uint16Array`, `degree: Uint16Array`, 엣지 `Int32Array(2m)`,
  `path↔index` 양방향 맵. 모든 레이어가 이 모델을 공유.
- **`protocol.ts`** — `InitGraph`, `Tick`(위치 버퍼), `SetParams`, `PinNode`,
  `Patch`(증분 노드/엣지 추가·삭제), `Stop` 메시지. 메인/워커가 동일 타입 import →
  계약 위반을 컴파일 타임에 차단.
- **`PhysicsEngine`** — Obsidian/Three 의존 0. 입력=토폴로지+파라미터,
  출력=위치 버퍼. → vitest 단위 테스트 가능.
- **`GraphRenderer`** — 입력=`GraphModel` + 최신 위치 버퍼, 출력=화면.
  raycast 결과(instanceId)를 상위로 콜백.

### 모듈 분리 근거

- 물리(`physics/`)는 워커에서 돌고 Obsidian/DOM을 모르므로, Node 환경에서 그대로
  벤치마크·테스트 가능.
- 렌더(`render/`)는 데이터 출처를 모르고 `GraphModel`만 봄 → 합성 그래프로 렌더 테스트 가능.
- `Graph3DView`만 세 레이어를 아는 "조립자" → 각 레이어 내부는 서로 모름.

## 4. 물리 엔진 상세

- **척력(repulsion)**: Barnes-Hut octree로 n-body 근사, O(n log n).
  θ(개방 기준)는 0.7~0.9 범위로 조절 가능(정확도 vs 속도).
- **인력(attraction)**: 엣지를 따라 spring force.
- **중심화/중력**: 그래프가 흩어지지 않도록 중심으로 향하는 약한 힘.
- **적분**: Velocity Verlet(또는 damping 포함 Euler), d3-force류 alpha decay.
- **안정화**: alpha < 임계값이면 tick 정지. 드래그/그래프 변경 시 reheat.
- **틱 레이트**: 30~60 tick/s, 렌더와 독립.

## 5. 렌더링 상세

- **노드**: `InstancedMesh`(구 또는 빌보드 스프라이트), 인스턴스별 색상·스케일.
  매 프레임 위치 버퍼에서 인스턴스 행렬 갱신. 단일 draw call.
- **엣지**: `LineSegments` + `BufferGeometry`, position attribute를 노드 위치에서 갱신.
  단일 draw call.
- **카메라**: `PerspectiveCamera` + `OrbitControls`.
- **피킹**: raycaster를 InstancedMesh에 적용해 instanceId 획득(hover/click).
- **라벨**: CSS2D 오버레이, 호버 노드 + 상위 degree 소수만 표시.
- **루프**: `requestAnimationFrame`, 워커의 최신 위치 버퍼를 읽어 갱신.

## 6. 상호작용

- **호버** → raycast → 라벨 툴팁 + 노드/이웃 하이라이트.
- **클릭/더블클릭** → `app.workspace.getLeaf().openFile(file)` (트리거는 설정 가능).
- **드래그** → 노드 핀/위치를 워커로 전송.
- **로컬 그래프 모드** → 활성 파일 기준 BFS depth-N 서브그래프만 물리/렌더에 투입.
  활성 파일 변경 시 갱신.

## 7. 설정

설정 탭(`loadData`/`saveData`로 영속):
- force 파라미터(repulsion, link strength, gravity, damping)
- color-by(folder / tag / none)
- 노드 크기 스케일(degree 기준)
- 로컬 그래프 depth
- 라벨 표시 옵션
- 노드 수 상한(cap)

## 8. 성능 전략

- 핫 루프에 객체 0 — 전부 typed array.
- 노드 InstancedMesh 단일 draw call, 엣지 LineSegments 단일 draw call.
- 척력 Barnes-Hut O(n log n).
- 물리·렌더 디커플링.
- alpha decay 안정화 → tick 자동 정지(idle CPU 0), 변경 시 reheat.
- 라벨은 호버 + 상위 degree 소수만 DOM에.

## 9. 에러 처리 / 견고성

- 빈/없는 vault → 빈 상태 안내, 크래시 없음.
- 워커 생성·실행 실패 → catch 후 Notice, 마지막 위치로 정적 렌더 폴백.
- SharedArrayBuffer 미지원 → transferable double-buffer 자동 폴백.
- 그래프 증분 변경 → 전체 재빌드 대신 `Patch` 메시지로 부분 갱신, 인덱스 안정 유지.
- WebGL 컨텍스트 손실 → 리스너 감지 후 씬 재생성.
- 노드 수 매우 많을 때 → 설정 상한과 현재 노드 수 표시.

## 10. 테스트 전략

- **단위 테스트(vitest)** — 프레임워크 무관 순수 모듈: `Octree`(질량중심/근사 정확도),
  `PhysicsEngine`(힘 방향·수렴), `GraphModel` 빌드(resolvedLinks→모델), `grouping`,
  `localGraph` BFS.
- **목 테스트** — `app.metadataCache` 목으로 `GraphDataProvider` 검증.
- **성능 하니스** — 합성 그래프 생성기(10k 노드 무작위)로 tick 시간·FPS 측정 스크립트(회귀 감지).
- **수동 검증** — 렌더/상호작용은 실제 vault에서(`.obsidian/plugins` 핫리로드).

## 11. 범위 경계 (v1 vs 이후)

| v1 포함 | 이후(deferred) |
|---|---|
| 3D 전역 그래프, 실시간 워커 물리 | 검색/필터 UI |
| 노드 클릭→노트 열기, 호버 라벨 | 첨부파일/태그-노드/미해석 링크 |
| 폴더·태그 색상 그룹화 | 시간축 애니메이션, 클러스터링 |
| 로컬 그래프 모드(depth-N) | LOD/더 큰 50k+ 최적화 |
| 노드 드래그, degree 기반 크기 | 테마/색상 커스터마이징 고급 옵션 |
| 설정 탭(force/색상/depth/라벨) | GPGPU force 계산 |
