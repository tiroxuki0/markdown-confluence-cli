import { ConfluenceSettings } from "../Settings";
export declare abstract class SettingsLoader {
  abstract loadPartial(): Partial<ConfluenceSettings>;
  load(): ConfluenceSettings;
  protected validateSettings(
    settings: Partial<ConfluenceSettings>,
  ): ConfluenceSettings;
}
//# sourceMappingURL=SettingsLoader.d.ts.map
