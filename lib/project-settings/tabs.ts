export type ProjectSettingsTabId = "issue-config" | "observation-config";

export interface ProjectSettingsTab {
  id: ProjectSettingsTabId;
  href: `/project-settings/${ProjectSettingsTabId}`;
  labelKey: "issueConfig" | "observationConfig";
  enabled: boolean;
}

export function buildProjectSettingsTabs(options: {
  canManageIssueReportConfig: boolean;
}): ProjectSettingsTab[] {
  const tabs: ProjectSettingsTab[] = [];
  if (options.canManageIssueReportConfig) {
    tabs.push({
      id: "issue-config",
      href: "/project-settings/issue-config",
      labelKey: "issueConfig",
      enabled: true,
    });
    tabs.push({
      id: "observation-config",
      href: "/project-settings/observation-config",
      labelKey: "observationConfig",
      enabled: true,
    });
  }
  return tabs;
}
