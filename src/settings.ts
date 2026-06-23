import { App, PluginSettingTab, Setting } from "obsidian";
import type FastGraphPlugin from "./main";
import type { GroupBy } from "./types";

export class FastGraphSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: FastGraphPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("색상 그룹 기준")
      .setDesc("노드 색상을 폴더/태그/없음 중 무엇으로 묶을지")
      .addDropdown((d) =>
        d
          .addOptions({ folder: "폴더", tag: "태그", none: "없음" })
          .setValue(this.plugin.settings.groupBy)
          .onChange(async (v) => {
            this.plugin.settings.groupBy = v as GroupBy;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("로컬 그래프 깊이")
      .setDesc("로컬 모드에서 펼칠 이웃 단계 수")
      .addSlider((s) =>
        s
          .setLimits(1, 4, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.localGraphDepth)
          .onChange(async (v) => {
            this.plugin.settings.localGraphDepth = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("노드 크기 (degree 스케일)")
      .addSlider((s) =>
        s
          .setLimits(0, 3, 0.1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.nodeDegreeScale)
          .onChange(async (v) => {
            this.plugin.settings.nodeDegreeScale = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("호버 라벨 표시")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showLabels).onChange(async (v) => {
          this.plugin.settings.showLabels = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("최대 노드 수")
      .setDesc("이 수를 넘으면 경고를 표시")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.maxNodes)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) {
            this.plugin.settings.maxNodes = n;
            await this.plugin.saveSettings();
          }
        })
      );
  }
}
