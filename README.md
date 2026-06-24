# Fast 3D Graph

**Explore your entire Obsidian vault as a fast, lightweight 3D force‑directed graph — smooth even with tens of thousands of notes.**

> 수만 개의 노트도 끊김 없이. 옵시디언 그래프를 빠르고 가볍게 **3D**로 보여주는 뷰입니다.

![Fast 3D Graph](screen1.png)

---

## English

### What it is

Fast 3D Graph renders your whole vault as a 3D, real‑time, force‑directed graph. It is built around one goal: **show a huge number of notes beautifully in 3D, and keep it smooth.** Where the built‑in graph slows down on large vaults, this view stays fluid by splitting work across threads and leaning on the GPU.

### Highlights

- 🌐 **True 3D graph** of your vault, rendered with Three.js — nodes as GPU‑instanced spheres, links as a single line batch (2 draw calls total).
- ⚡ **Built for scale** — **20,000 nodes render at ~75 FPS**, and it handles **50,000+**. The force simulation runs in a **Web Worker** powered by a **WebAssembly** physics core (AssemblyScript Barnes‑Hut, ~1.2× faster than the JS engine, with automatic JS fallback), so the camera and rendering stay smooth while the layout settles. Idle CPU drops to zero once it settles (alpha decay).
- 🎨 **Cluster‑aware layout** — notes are grouped by folder or tag, with cohesion (pull same‑group together) and separation (push groups apart) forces, so communities are spatially distinct instead of one tangled ball.
- ✨ **Flowing‑data hover effect** — hover or select a node and glowing particles stream along its links toward connected notes, with a gentle sequential color gradient.
- 🖱️ **Interactive** — click a node to select it (its neighbors light up), click it again to open the note; hover for the title; drag to orbit; scroll to zoom.
- 🔎 **Local‑graph mode** — focus on the active note and its neighbors up to N hops.
- 🎞️ **Gentle auto‑rotation** for a presentable 3D feel (toggleable).
- 🚫 **Respects Obsidian's _Excluded files_** setting (Settings → Files and links).

### Demo

A real vault settling into its 3D layout:

<video src="https://github.com/jkRaccoon/obsidian-fast-graph/raw/main/sample.mp4" controls muted loop width="100%"></video>

*(If the player doesn't load inline, [download/open sample.mp4](sample.mp4).)*

20,000 nodes — still smooth:

<video src="https://github.com/jkRaccoon/obsidian-fast-graph/raw/main/20k.mp4" controls muted loop width="100%"></video>

*(Or [open 20k.mp4](20k.mp4).)*

### Performance

Measured on a real machine (Apple Silicon). Render FPS is decoupled from the worker physics:

| Nodes   | Edges   | Render | Physics tick (WASM) | Settle |
| ------- | ------- | ------ | ------------------- | ------ |
| ~2,000  | ~5k     | 60 FPS | ~5 ms               | ~1 s   |
| ~10,000 | ~25k    | 60 FPS | ~38 ms              | ~9 s   |
| 20,000  | ~51k    | **75 FPS** | ~81 ms          | ~20 s  |
| 50,000  | ~126k   | fluid  | ~268 ms             | ~60 s  |

Physics runs in a **WebAssembly** core (AssemblyScript), ~1.2× faster than the previous JS engine, with automatic fallback to JS if WASM is unavailable. Because the simulation lives in a Web Worker, a heavy tick never stalls the view — you can orbit, zoom, and click throughout while the graph organizes itself.

### Installation

Available in the Obsidian **Community plugins** store:

1. Open **Settings → Community plugins** and turn off Restricted mode.
2. Click **Browse**, search for **"Fast 3D Graph"**, and install.
3. Enable it. (Desktop only.)

> **Building from source (for development):** `yarn install && yarn build`, then copy `main.js`, `manifest.json`, and `styles.css` into `<your vault>/.obsidian/plugins/fast-graph/`.

### Usage

- Click the **git‑fork ribbon icon**, or run the command **"3D 그래프 열기" / "Open 3D graph"**.
- Run **"Open 3D local graph"** to focus on the active note's neighborhood.
- **Drag** to orbit · **scroll** to zoom · **click** a node to open it · **hover** for the title.

### Settings

Color grouping (folder / tag / none) · local‑graph depth · node size by degree · hover labels · **auto‑rotate** · **respect Obsidian excluded files** · max nodes.

### How it works

Three layers, split by thread so physics never blocks rendering:

- **Data** — reads `metadataCache.resolvedLinks` into compact typed arrays; groups by folder/tag; applies the excluded‑files filter.
- **Physics (Web Worker + WebAssembly)** — Barnes‑Hut octree repulsion + spring links + group cohesion/separation, integrated with per‑tick displacement clamping for stability. The hot loop is compiled to **WebAssembly** (AssemblyScript, raw linear‑memory access) for speed, cross‑validated against the JS reference and falling back to it automatically if WASM is unavailable; positions are sent back as a transferable buffer.
- **Render (main thread, Three.js)** — `InstancedMesh` nodes + `LineSegments` edges updated from the latest position buffer each frame; `OrbitControls` camera; raycast picking.

---

## 한국어

### 소개

Fast 3D Graph는 vault 전체를 **실시간 3D force‑directed 그래프**로 그립니다. 목표는 하나입니다 — **아주 많은 노트도 3D로 멋지게, 그리고 끊김 없이 보여주기.** 기본 그래프가 큰 vault에서 버벅이는 지점을, 연산을 스레드로 분리하고 GPU를 활용해 부드럽게 유지합니다.

### 특징

- 🌐 **진짜 3D 그래프** — Three.js로 렌더. 노드는 GPU 인스턴싱 구, 엣지는 단일 라인 배치(전체 draw call 2개).
- ⚡ **대형 vault를 위한 설계** — **2만 노드를 ~75 FPS로 렌더**하고, **5만+**도 다룹니다. 물리 시뮬레이션은 **Web Worker** 안에서 **WebAssembly** 코어(AssemblyScript Barnes‑Hut, JS 엔진 대비 ~1.2× 빠름, WASM 불가 시 JS 자동 폴백)로 돌아, 레이아웃이 자리를 잡는 동안에도 카메라·렌더가 부드럽습니다. 안정되면(alpha decay) idle CPU는 0이 됩니다.
- 🎨 **군집 인식 레이아웃** — 폴더/태그로 노드를 묶고, 응집(같은 그룹을 모음) + 분리(그룹끼리 벌림) 힘으로 군집이 한 덩어리로 뭉치지 않고 공간적으로 또렷이 나뉩니다.
- ✨ **흐르는 데이터 호버 효과** — 노드를 호버하거나 선택하면 연결된 노트로 엣지를 따라 글로우 파티클이 흐르고, 색이 시퀀셜 그라디언트로 변합니다.
- 🖱️ **상호작용** — 노드 클릭 시 선택(이웃이 강조), 한 번 더 클릭하면 노트 열기. 호버 시 제목, 드래그로 회전, 스크롤로 줌.
- 🔎 **로컬 그래프 모드** — 현재 노트와 N단계 이웃만 집중해서 보기.
- 🎞️ **천천히 자동 회전**으로 입체감 있게(끄기 가능).
- 🚫 **Obsidian "제외할 파일" 설정 반영**(설정 → 파일 및 링크).

### 데모

실제 vault가 3D 레이아웃으로 자리 잡는 모습:

<video src="https://github.com/jkRaccoon/obsidian-fast-graph/raw/main/sample.mp4" controls muted loop width="100%"></video>

*(인라인 플레이어가 안 보이면 [sample.mp4 열기](sample.mp4).)*

2만 노드 — 그래도 부드럽습니다:

<video src="https://github.com/jkRaccoon/obsidian-fast-graph/raw/main/20k.mp4" controls muted loop width="100%"></video>

*(또는 [20k.mp4 열기](20k.mp4).)*

### 성능

실측(Apple Silicon). 렌더 FPS는 워커 물리와 분리되어 있습니다:

| 노드   | 엣지   | 렌더    | 물리 tick (WASM) | 수렴   |
| ------ | ------ | ------- | ---------------- | ------ |
| ~2,000 | ~5천   | 60 FPS  | ~5 ms            | ~1초   |
| ~10,000| ~2.5만 | 60 FPS  | ~38 ms           | ~9초   |
| 20,000 | ~5.1만 | **75 FPS** | ~81 ms        | ~20초  |
| 50,000 | ~12.6만 | 부드러움 | ~268 ms         | ~60초  |

물리는 **WebAssembly** 코어(AssemblyScript)로 돌아 이전 JS 엔진보다 ~1.2× 빠르며, WASM을 쓸 수 없으면 JS로 자동 폴백합니다. 물리가 워커에 있기 때문에 tick이 무거워도 화면이 멈추지 않습니다 — 그래프가 정렬되는 동안에도 회전·줌·클릭이 자유롭습니다.

### 설치

Obsidian **커뮤니티 플러그인** 스토어에서 설치할 수 있습니다:

1. **설정 → 커뮤니티 플러그인**에서 제한 모드를 끕니다.
2. **탐색**을 눌러 **"Fast 3D Graph"**를 검색하고 설치합니다.
3. 활성화합니다. (데스크톱 전용)

> **소스에서 빌드(개발용):** `yarn install && yarn build` 후 `main.js`, `manifest.json`, `styles.css`를 `<vault>/.obsidian/plugins/fast-graph/`에 복사.

### 사용법

- **git‑fork 리본 아이콘** 클릭, 또는 명령 **"3D 그래프 열기"** 실행.
- **"3D 로컬 그래프 열기"**로 현재 노트 주변만 보기.
- **드래그** 회전 · **스크롤** 줌 · 노드 **클릭** 열기 · **호버** 제목.

### 설정

색상 그룹(폴더/태그/없음) · 로컬 그래프 깊이 · degree 기반 노드 크기 · 호버 라벨 · **자동 회전** · **Obsidian 제외 파일 반영** · 최대 노드 수.

### 동작 원리

물리가 렌더를 막지 않도록 3개 레이어를 스레드로 분리:

- **데이터** — `metadataCache.resolvedLinks`를 typed array로 빌드, 폴더/태그 그룹화, 제외 파일 필터 적용.
- **물리(Web Worker + WebAssembly)** — Barnes‑Hut octree 척력 + 스프링 인력 + 그룹 응집/분리. per‑tick 변위 클램프로 안정적으로 적분. 핫 루프는 속도를 위해 **WebAssembly**(AssemblyScript, raw 선형메모리 접근)로 컴파일하며, JS 참조 구현과 교차검증하고 WASM 불가 시 자동 폴백합니다. 위치 버퍼는 transferable로 메인에 전송.
- **렌더(메인, Three.js)** — 최신 위치 버퍼로 매 프레임 `InstancedMesh` 노드 + `LineSegments` 엣지 갱신. `OrbitControls` 카메라, raycast 피킹.

---

<sub>Made for large Obsidian vaults. 🦝</sub>
