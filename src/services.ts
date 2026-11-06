import { ConfigManager } from './configuration/configManager';
import { FormatController } from './formatter/formatController';
import { JdtFormatterService } from './formatter/jdtService';
import { ProfileManager } from './formatter/profileManager';
import { ThemeManager } from './themes/themeManager';

/** Central service registry for JavaScope. */
export interface JavaScopeServices {
    config: ConfigManager;
    profiles: ProfileManager;
    themes: ThemeManager;
    formatting: FormatController;
    jdt: JdtFormatterService;
    refreshThemes(): Promise<void>;
    reloadAll(): Promise<void>;
}
