import { App, PluginSettingTab, Setting } from "obsidian";
import type FastGraphPlugin from "./main";
import type { GroupBy } from "./types";
import { getStrings } from "./i18n";

export class FastGraphSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: FastGraphPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const strings = getStrings().settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName(strings.groupByName)
      .setDesc(strings.groupByDesc)
      .addDropdown((d) =>
        d
          .addOptions(strings.groupByOptions)
          .setValue(this.plugin.settings.groupBy)
          .onChange(async (v) => {
            this.plugin.settings.groupBy = v as GroupBy;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(strings.localGraphDepthName)
      .setDesc(strings.localGraphDepthDesc)
      .addSlider((s) =>
        s
          .setLimits(1, 4, 1)
          .setValue(this.plugin.settings.localGraphDepth)
          .onChange(async (v) => {
            this.plugin.settings.localGraphDepth = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(strings.nodeDegreeScaleName)
      .addSlider((s) =>
        s
          .setLimits(0, 3, 0.1)
          .setValue(this.plugin.settings.nodeDegreeScale)
          .onChange(async (v) => {
            this.plugin.settings.nodeDegreeScale = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(strings.showLabelsName)
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showLabels).onChange(async (v) => {
          this.plugin.settings.showLabels = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(strings.autoRotateName)
      .setDesc(strings.autoRotateDesc)
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoRotate).onChange(async (v) => {
          // 시뮬레이션 재시작 없이 즉시 토글
          await this.plugin.updateAutoRotate(v);
        })
      );

    new Setting(containerEl)
      .setName(strings.respectObsidianExclusionsName)
      .setDesc(strings.respectObsidianExclusionsDesc)
      .addToggle((t) =>
        t.setValue(this.plugin.settings.respectObsidianExclusions).onChange(async (v) => {
          this.plugin.settings.respectObsidianExclusions = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(strings.maxNodesName)
      .setDesc(strings.maxNodesDesc)
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
