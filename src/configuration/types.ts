/**
 * Core configuration types for JavaScope.
 *
 * JavaScope keeps its own configuration in `.javascope/settings.json` files
 * (user-level `~/.javascope` and workspace-level `<workspace>/.javascope`),
 * layered on top of the VS Code `javascope.*` settings and built-in defaults.
 */

export type ConfigurationLocation = 'auto' | 'user' | 'workspace';

export interface ThemeSettings {
    enabled: boolean;
    /** Theme identifier: builtin id, or `custom:<name>` for custom themes. */
    active: string;
    /** Optional coloring of the HTML template parts inside .jsp files. */
    jspTemplates?: {
        enabled: boolean;
    };
}

export interface FormatterSettings {
    enabled: boolean;
    activeProfile: string;
    formatOnSave: boolean;
}

export interface JavaScopeSettings {
    enabled: boolean;
    configurationLocation: ConfigurationLocation;
    themes: ThemeSettings;
    javaFormatter: FormatterSettings;
    jspFormatter: FormatterSettings;
}

export type SettingOrigin =
    | 'default'
    | 'vscode-user'
    | 'vscode-workspace'
    | 'user'
    | 'workspace';

export interface OriginatedValue<T> {
    value: T;
    origin: SettingOrigin;
}

export interface EffectiveSettings {
    enabled: OriginatedValue<boolean>;
    configurationLocation: OriginatedValue<ConfigurationLocation>;
    themes: {
        enabled: OriginatedValue<boolean>;
        active: OriginatedValue<string>;
        jspTemplates: OriginatedValue<boolean>;
    };
    javaFormatter: {
        enabled: OriginatedValue<boolean>;
        activeProfile: OriginatedValue<string>;
        formatOnSave: OriginatedValue<boolean>;
    };
    jspFormatter: {
        enabled: OriginatedValue<boolean>;
        activeProfile: OriginatedValue<string>;
        formatOnSave: OriginatedValue<boolean>;
    };
}

export const BUILTIN_DEFAULTS: JavaScopeSettings = {
    enabled: true,
    configurationLocation: 'auto',
    themes: {
        enabled: true,
        active: 'eclipse-light',
        jspTemplates: { enabled: false },
    },
    javaFormatter: {
        enabled: true,
        activeProfile: 'builtin:java:eclipse-default',
        formatOnSave: false,
    },
    jspFormatter: {
        enabled: true,
        activeProfile: 'builtin:jsp:default',
        formatOnSave: false,
    },
};

/** Loose shape of `.javascope/settings.json`. Unknown keys are ignored. */
export interface SettingsFile {
    version?: number;
    enabled?: boolean;
    configurationLocation?: ConfigurationLocation;
    themes?: Partial<ThemeSettings>;
    javaFormatter?: Partial<FormatterSettings>;
    jspFormatter?: Partial<FormatterSettings>;
    [key: string]: unknown;
}

export function isConfigurationLocation(v: unknown): v is ConfigurationLocation {
    return v === 'auto' || v === 'user' || v === 'workspace';
}
