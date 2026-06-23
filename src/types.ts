export type GroupBy = "folder" | "tag" | "none";

export interface ForceParams {
  repulsion: number;        // 척력 세기 (>0)
  linkStrength: number;     // spring 세기
  linkDistance: number;     // spring 이상 거리
  gravity: number;          // 중심화 세기
  damping: number;          // 속도 감쇠(0~1, tick당 곱)
  theta: number;            // Barnes-Hut 개방 기준
  groupCohesion: number;    // 같은 그룹 노드를 그룹 중심으로 끌어당기는 세기
  groupSeparation: number;  // 그룹 중심끼리 밀어내는 세기(Coulomb)
}

export const FORCE_DEFAULTS: ForceParams = {
  repulsion: 30,
  linkStrength: 0.05,
  linkDistance: 30,
  gravity: 0.011,           // 군집 분리를 위해 완화(기존 0.02), 너무 벌어지지 않게 약간 상향
  damping: 0.9,
  theta: 0.8,
  groupCohesion: 0.08,
  groupSeparation: 100,
};

export interface RenderSettings {
  groupBy: GroupBy;
  nodeBaseSize: number;
  nodeDegreeScale: number;
  localGraphDepth: number;
  showLabels: boolean;
  maxNodes: number;
  respectObsidianExclusions: boolean;
  autoRotate: boolean;
}

export const RENDER_DEFAULTS: RenderSettings = {
  groupBy: "folder",
  nodeBaseSize: 2,
  nodeDegreeScale: 0.5,
  localGraphDepth: 1,
  showLabels: true,
  maxNodes: 20000,
  respectObsidianExclusions: true,
  autoRotate: true,
};
