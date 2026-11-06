import {
    BUILTIN_DEFAULTS,
    ConfigurationLocation,
    EffectiveSettings,
    FormatterSettings,
    isConfigurationLocation,
    JavaScopeSettings,
    OriginatedValue,
    SettingOrigin,
    SettingsFile,
    ThemeSettings,
} from './types';

export function originated<T>(value: T, origin: SettingOrigin): OriginatedValue<T> {
    return { value, origin };
}

export function defaultSettings(): JavaScopeSettings {
    return JSON.parse(JSON.stringify(BUILTIN_DEFAULTS)) as JavaScopeSettings;
}

/**
 * Merges layered configuration sources into an effective settings snapshot.
 *
 * Precedence (highest wins):
 *   workspace `.javascope/settings.json`
 *   > user `~/.javascope/settings.json`
 *   > VS Code workspace settings (`javascope.*`)
 *   > VS Code user settings (`javascope.*`)
 *   > built-in defaults
 */
export function mergeSettings(input: {
    vscodeUser?: Partial<SettingsFile>;
    vscodeWorkspace?: Partial<SettingsFile>;
    userSettings?: SettingsFile | null;
    workspaceSettings?: SettingsFile | null;
}): EffectiveSettings {
    const d = BUILTIN_DEFAULTS;
    const vUser = input.vscodeUser ?? {};
    const vWs = input.vscodeWorkspace ?? {};
    const user = input.userSettings ?? {};
    const ws = input.workspaceSettings ?? {};

    const pickBool = (
        def: boolean,
        vU: unknown,
        vW: unknown,
        u: unknown,
        w: unknown,
        labels: [SettingOrigin, SettingOrigin, SettingOrigin, SettingOrigin],
    ): OriginatedValue<boolean> => {
        if (typeof w === 'boolean') return originated(w, labels[3]);
        if (typeof u === 'boolean') return originated(u, labels[2]);
        if (typeof vW === 'boolean') return originated(vW, labels[1]);
        if (typeof vU === 'boolean') return originated(vU, labels[0]);
        return originated(def, 'default');
    };

    const pickString = (
        def: string,
        vU: unknown,
        vW: unknown,
        u: unknown,
        w: unknown,
        labels: [SettingOrigin, SettingOrigin, SettingOrigin, SettingOrigin],
    ): OriginatedValue<string> => {
        if (typeof w === 'string' && w.length > 0) return originated(w, labels[3]);
        if (typeof u === 'string' && u.length > 0) return originated(u, labels[2]);
        if (typeof vW === 'string' && vW.length > 0) return originated(vW, labels[1]);
        if (typeof vU === 'string' && vU.length > 0) return originated(vU, labels[0]);
        return originated(def, 'default');
    };

    const vscodeLabels: [SettingOrigin, SettingOrigin, SettingOrigin, SettingOrigin] = [
        'vscode-user',
        'vscode-workspace',
        'user',
        'workspace',
    ];

    const loc = pickString(
        d.configurationLocation,
        vUser.configurationLocation,
        vWs.configurationLocation,
        user.configurationLocation,
        ws.configurationLocation,
        vscodeLabels,
    );
    if (!isConfigurationLocation(loc.value)) {
        loc.value = 'auto';
    }

    const mergeFormatter = (
        def: FormatterSettings,
        vUf: Partial<FormatterSettings> | undefined,
        vWf: Partial<FormatterSettings> | undefined,
        uf: Partial<FormatterSettings> | undefined,
        wf: Partial<FormatterSettings> | undefined,
    ) => ({
        enabled: pickBool(def.enabled, vUf?.enabled, vWf?.enabled, uf?.enabled, wf?.enabled, vscodeLabels),
        activeProfile: pickString(
            def.activeProfile,
            vUf?.activeProfile,
            vWf?.activeProfile,
            uf?.activeProfile,
            wf?.activeProfile,
            vscodeLabels,
        ),
        formatOnSave: pickBool(
            def.formatOnSave,
            vUf?.formatOnSave,
            vWf?.formatOnSave,
            uf?.formatOnSave,
            wf?.formatOnSave,
            vscodeLabels,
        ),
    });

    const themes: {
        enabled: OriginatedValue<boolean>;
        active: OriginatedValue<string>;
        jspTemplates: OriginatedValue<boolean>;
    } = {
        enabled: pickBool(
            d.themes.enabled,
            vUser.themes?.enabled,
            vWs.themes?.enabled,
            user.themes?.enabled,
            ws.themes?.enabled,
            vscodeLabels,
        ),
        active: pickString(
            d.themes.active,
            vUser.themes?.active,
            vWs.themes?.active,
            user.themes?.active,
            ws.themes?.active,
            vscodeLabels,
        ),
        jspTemplates: pickBool(
            d.themes.jspTemplates?.enabled ?? false,
            vUser.themes?.jspTemplates?.enabled,
            vWs.themes?.jspTemplates?.enabled,
            user.themes?.jspTemplates?.enabled,
            ws.themes?.jspTemplates?.enabled,
            vscodeLabels,
        ),
    };

    return {
        enabled: pickBool(d.enabled, vUser.enabled, vWs.enabled, user.enabled, ws.enabled, vscodeLabels),
        configurationLocation: loc as OriginatedValue<ConfigurationLocation>,
        themes,
        javaFormatter: mergeFormatter(
            d.javaFormatter,
            vUser.javaFormatter,
            vWs.javaFormatter,
            user.javaFormatter,
            ws.javaFormatter,
        ),
        jspFormatter: mergeFormatter(
            d.jspFormatter,
            vUser.jspFormatter,
            vWs.jspFormatter,
            user.jspFormatter,
            ws.jspFormatter,
        ),
    };
}

/** Validates the shape of a parsed settings.json document. Returns a list of problems. */
export function validateSettingsFile(doc: unknown): string[] {
    const problems: string[] = [];
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
        problems.push('settings.json must contain a JSON object');
        return problems;
    }
    const o = doc as Record<string, unknown>;
    if (o.enabled !== undefined && typeof o.enabled !== 'boolean') {
        problems.push('"enabled" must be a boolean');
    }
    if (o.configurationLocation !== undefined && !isConfigurationLocation(o.configurationLocation)) {
        problems.push('"configurationLocation" must be one of: auto, user, workspace');
    }
    const checkFormatter = (key: string): void => {
        const f = o[key];
        if (f === undefined) {
            return;
        }
        if (typeof f !== 'object' || f === null || Array.isArray(f)) {
            problems.push(`"${key}" must be an object`);
            return;
        }
        const fo = f as Record<string, unknown>;
        if (fo.enabled !== undefined && typeof fo.enabled !== 'boolean') {
            problems.push(`"${key}.enabled" must be a boolean`);
        }
        if (fo.activeProfile !== undefined && typeof fo.activeProfile !== 'string') {
            problems.push(`"${key}.activeProfile" must be a string`);
        }
        if (fo.formatOnSave !== undefined && typeof fo.formatOnSave !== 'boolean') {
            problems.push(`"${key}.formatOnSave" must be a boolean`);
        }
    };
    const t = o.themes;
    if (t !== undefined) {
        if (typeof t !== 'object' || t === null || Array.isArray(t)) {
            problems.push('"themes" must be an object');
        } else {
            const to = t as Record<string, unknown>;
            if (to.enabled !== undefined && typeof to.enabled !== 'boolean') {
                problems.push('"themes.enabled" must be a boolean');
            }
            if (to.active !== undefined && typeof to.active !== 'string') {
                problems.push('"themes.active" must be a string');
            }
            if (to.jspTemplates !== undefined) {
                const jt = to.jspTemplates;
                if (typeof jt !== 'object' || jt === null || Array.isArray(jt)) {
                    problems.push('"themes.jspTemplates" must be an object');
                } else if (typeof (jt as Record<string, unknown>).enabled !== 'boolean') {
                    problems.push('"themes.jspTemplates.enabled" must be a boolean');
                }
            }
        }
    }
    checkFormatter('javaFormatter');
    checkFormatter('jspFormatter');
    return problems;
}

/** Deep-partial patch used for updates. */
export type SettingsPatch = {
    enabled?: boolean;
    configurationLocation?: ConfigurationLocation;
    themes?: Partial<ThemeSettings>;
    javaFormatter?: Partial<FormatterSettings>;
    jspFormatter?: Partial<FormatterSettings>;
};
