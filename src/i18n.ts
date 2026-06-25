import { moment } from "obsidian";
import type { GroupBy } from "./types";

export type Locale = "en" | "ko";

interface SettingsStrings {
  groupByName: string;
  groupByDesc: string;
  groupByOptions: Record<GroupBy, string>;
  localGraphDepthName: string;
  localGraphDepthDesc: string;
  nodeDegreeScaleName: string;
  showLabelsName: string;
  autoRotateName: string;
  autoRotateDesc: string;
  respectObsidianExclusionsName: string;
  respectObsidianExclusionsDesc: string;
  maxNodesName: string;
  maxNodesDesc: string;
}

interface AppStrings {
  ribbonOpenGraph: string;
  commandOpenGraph: string;
  commandOpenLocalGraph: string;
  refreshError: string;
  settings: SettingsStrings;
}

export const STRINGS: Record<Locale, AppStrings> = {
  en: {
    ribbonOpenGraph: "Open Fast 3D Graph",
    commandOpenGraph: "Open 3D graph",
    commandOpenLocalGraph: "Open local 3D graph",
    refreshError: "Fast 3D Graph: Refresh failed. Check the console.",
    settings: {
      groupByName: "Color grouping",
      groupByDesc: "Choose whether node colors are grouped by folder, tag, or nothing.",
      groupByOptions: { folder: "Folder", tag: "Tag", none: "None" },
      localGraphDepthName: "Local graph depth",
      localGraphDepthDesc: "Number of neighbor steps to expand in local mode.",
      nodeDegreeScaleName: "Node size (degree scale)",
      showLabelsName: "Show hover labels",
      autoRotateName: "Auto-rotate",
      autoRotateDesc: "Slowly rotate the graph for a stronger 3D effect. Turn this off to stop rotation.",
      respectObsidianExclusionsName: "Use Obsidian excluded files",
      respectObsidianExclusionsDesc:
        "Hide files from the graph when they match Settings > Files and links > Excluded files.",
      maxNodesName: "Maximum nodes",
      maxNodesDesc: "Show a warning when the graph exceeds this number.",
    },
  },
  ko: {
    ribbonOpenGraph: "Fast 3D Graph 열기",
    commandOpenGraph: "3D 그래프 열기",
    commandOpenLocalGraph: "3D 로컬 그래프 열기",
    refreshError: "Fast 3D Graph: 갱신 중 오류 - 콘솔 확인",
    settings: {
      groupByName: "색상 그룹 기준",
      groupByDesc: "노드 색상을 폴더/태그/없음 중 무엇으로 묶을지",
      groupByOptions: { folder: "폴더", tag: "태그", none: "없음" },
      localGraphDepthName: "로컬 그래프 깊이",
      localGraphDepthDesc: "로컬 모드에서 펼칠 이웃 단계 수",
      nodeDegreeScaleName: "노드 크기 (degree 스케일)",
      showLabelsName: "호버 라벨 표시",
      autoRotateName: "자동 회전",
      autoRotateDesc: "그래프를 천천히 회전시켜 입체감을 줍니다 (끄면 멈춥니다)",
      respectObsidianExclusionsName: "Obsidian 제외 파일 반영",
      respectObsidianExclusionsDesc: "설정 > 파일 및 링크 > 제외할 파일 목록에 해당하는 파일을 그래프에서 숨깁니다",
      maxNodesName: "최대 노드 수",
      maxNodesDesc: "이 수를 넘으면 경고를 표시",
    },
  },
};

export function localeFromLanguage(language: string | null | undefined): Locale {
  return language?.toLowerCase().replace("_", "-").startsWith("ko") ? "ko" : "en";
}

export function getLocale(): Locale {
  return localeFromLanguage(moment.locale());
}

export function getStrings(locale = getLocale()): AppStrings {
  return STRINGS[locale];
}
