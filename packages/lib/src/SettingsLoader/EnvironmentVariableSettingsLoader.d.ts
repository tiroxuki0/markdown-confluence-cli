import { ConfluenceSettings } from "../Settings";
import { SettingsLoader } from "./SettingsLoader";
export declare class EnvironmentVariableSettingsLoader extends SettingsLoader {
  getValue<T extends keyof ConfluenceSettings>(
    propertyKey: T,
    envVar: string,
  ): Partial<ConfluenceSettings>;
  loadPartial(): Partial<ConfluenceSettings>;
}
//# sourceMappingURL=EnvironmentVariableSettingsLoader.d.ts.map
