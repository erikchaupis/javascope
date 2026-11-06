import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import { defaultSettings, mergeSettings, SettingsPatch, validateSettingsFile } from './schema';
import {
    ConfigurationLocation,
    EffectiveSettings,
    JavaScopeSettings,
    SettingOrigin,
    SettingsFile,
} from './types';

export interface LoadedSettingsFile {
    file: SettingsFile | null;
    path: string;
    exists: boolean;
    problems: string[];
}

/**
 * Reads, validates and watches `.javascope/settings.json` files.
 *
 * This class is intentionally free of VS Code APIs so it can be unit tested
 * against temporary directories. A thin VS Code adapter supplies the VS Code
 * settings layer and filesystem watching.
 */
export class ConfigManager extends EventEmitter {
    readonly userConfigDir: string;
    readonly workspaceConfigDir: string | undefined;

    private userFile: LoadedSettingsFile;
    private workspaceFile: LoadedSettingsFile;
    private vscodeUser: Partial<SettingsFile> = {};
    private vscodeWorkspace: Partial<SettingsFile> = {};
    private watchers: Array<{ close(): void }> = [];

    constructor(options: { userConfigDir?: string; workspaceConfigDir?: string | null }) {
        super();
        this.userConfigDir = options.userConfigDir ?? path.join(os.homedir(), '.javascope');
        this.workspaceConfigDir = options.workspaceConfigDir ?? undefined;
        this.userFile = this.loadFrom(ConfigManager.settingsPath(this.userConfigDir));
        this.workspaceFile = this.workspaceConfigDir
            ? this.loadFrom(ConfigManager.settingsPath(this.workspaceConfigDir))
            : { file: null, path: '', exists: false, problems: [] };
    }

    static settingsPath(dir: string): string {
        return path.join(dir, 'settings.json');
    }

    get userSettingsPath(): string {
        return this.userFile.path;
    }

    get workspaceSettingsPath(): string {
        return this.workspaceFile.path;
    }

    /** Sets the VS Code settings layer (`javascope.*` after prefix stripping). */
    setVscodeLayer(user: Partial<SettingsFile>, workspace: Partial<SettingsFile>): void {
        this.vscodeUser = user ?? {};
        this.vscodeWorkspace = workspace ?? {};
    }

    /** Effective settings merged across all layers, with per-key origins. */
    get effective(): EffectiveSettings {
        return mergeSettings({
            vscodeUser: this.vscodeUser,
            vscodeWorkspace: this.vscodeWorkspace,
            userSettings: this.userFile.file,
            workspaceSettings: this.workspaceFile.file,
        });
    }

    /** Plain merged settings without origin information. */
    get settings(): JavaScopeSettings {
        const e = this.effective;
        return {
            enabled: e.enabled.value,
            configurationLocation: e.configurationLocation.value,
            themes: { enabled: e.themes.enabled.value, active: e.themes.active.value, jspTemplates: { enabled: e.themes.jspTemplates.value } },
            javaFormatter: {
                enabled: e.javaFormatter.enabled.value,
                activeProfile: e.javaFormatter.activeProfile.value,
                formatOnSave: e.javaFormatter.formatOnSave.value,
            },
            jspFormatter: {
                enabled: e.jspFormatter.enabled.value,
                activeProfile: e.jspFormatter.activeProfile.value,
                formatOnSave: e.jspFormatter.formatOnSave.value,
            },
        };
    }

    /** Where updates will be persisted, honoring `configurationLocation`. */
    resolveTarget(requested?: ConfigurationLocation): 'user' | 'workspace' {
        const loc = requested ?? this.settings.configurationLocation;
        if (loc === 'user') {
            return 'user';
        }
        if (loc === 'workspace') {
            if (!this.workspaceConfigDir) {
                throw new Error(
                    "configurationLocation is 'workspace' but no workspace folder is open; " +
                        'open a folder or switch the location to user/auto',
                );
            }
            return 'workspace';
        }
        // auto: prefer workspace when a folder is open so settings are shareable.
        return this.workspaceConfigDir ? 'workspace' : 'user';
    }

    /** Directory that updates will be written to. */
    resolveTargetDir(requested?: ConfigurationLocation): string {
        return this.resolveTarget(requested) === 'workspace'
            ? (this.workspaceConfigDir as string)
            : this.userConfigDir;
    }

    /**
     * Persists a settings patch to the settings.json at the resolved target.
     * Never touches the other location. Returns the file that was written.
     */
    update(patch: SettingsPatch, requested?: ConfigurationLocation): { target: 'user' | 'workspace'; path: string } {
        const target = this.resolveTarget(requested);
        const dir = target === 'workspace' ? (this.workspaceConfigDir as string) : this.userConfigDir;
        fs.mkdirSync(dir, { recursive: true });
        const filePath = ConfigManager.settingsPath(dir);
        let current: SettingsFile = {};
        if (fs.existsSync(filePath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SettingsFile;
                const problems = validateSettingsFile(parsed);
                if (problems.length === 0) {
                    current = parsed;
                }
            } catch {
                // overwrite corrupt file below
            }
        }
        const merged: SettingsFile = {
            ...current,
            version: 1,
            ...defined({ enabled: patch.enabled, configurationLocation: patch.configurationLocation }),
            themes: { ...current.themes, ...patch.themes },
            javaFormatter: { ...current.javaFormatter, ...patch.javaFormatter },
            jspFormatter: { ...current.jspFormatter, ...patch.jspFormatter },
        };
        if (patch.themes === undefined) {
            delete merged.themes;
            if (current.themes !== undefined) {
                merged.themes = current.themes;
            }
        }
        fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
        const loaded = this.loadFrom(filePath);
        if (target === 'user') {
            this.userFile = loaded;
        } else {
            this.workspaceFile = loaded;
        }
        return { target, path: filePath };
    }

    /** Re-reads settings files from disk. */
    reload(): void {
        this.userFile = this.loadFrom(ConfigManager.settingsPath(this.userConfigDir));
        if (this.workspaceConfigDir) {
            this.workspaceFile = this.loadFrom(ConfigManager.settingsPath(this.workspaceConfigDir));
        }
        this.emit('change', { reason: 'reload' });
    }

    /** Validation problems for both settings files, for display. */
    get problems(): Array<{ location: string; problems: string[] }> {
        const out: Array<{ location: string; problems: string[] }> = [];
        if (this.userFile.exists && this.userFile.problems.length > 0) {
            out.push({ location: this.userFile.path, problems: this.userFile.problems });
        }
        if (this.workspaceFile.exists && this.workspaceFile.problems.length > 0) {
            out.push({ location: this.workspaceFile.path, problems: this.workspaceFile.problems });
        }
        return out;
    }

    get hasWorkspaceConfig(): boolean {
        return this.workspaceFile.exists;
    }

    get hasUserConfig(): boolean {
        return this.userFile.exists;
    }

    private loadFrom(filePath: string): LoadedSettingsFile {
        if (!fs.existsSync(filePath)) {
            return { file: null, path: filePath, exists: false, problems: [] };
        }
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw) as unknown;
            const problems = validateSettingsFile(parsed);
            if (problems.length > 0) {
                return { file: null, path: filePath, exists: true, problems };
            }
            return { file: parsed as SettingsFile, path: filePath, exists: true, problems: [] };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { file: null, path: filePath, exists: true, problems: [`invalid JSON: ${msg}`] };
        }
    }

    /** Watches the config directories; emits 'change' with a reason. */
    watch(watchFactory: (dir: string, onChange: (reason: string) => void) => Array<{ close(): void }>): void {
        this.disposeWatchers();
        const dirs = [this.userConfigDir, this.workspaceConfigDir].filter(
            (d): d is string => typeof d === 'string' && d.length > 0,
        );
        for (const dir of dirs) {
            this.watchers.push(...watchFactory(dir, () => {
                this.reload();
            }));
        }
    }

    private disposeWatchers(): void {
        for (const w of this.watchers) {
            try {
                w.close();
            } catch {
                // ignore
            }
        }
        this.watchers = [];
    }

    dispose(): void {
        this.disposeWatchers();
        this.removeAllListeners();
    }
}

function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const out: Partial<T> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) {
            (out as Record<string, unknown>)[k] = v;
        }
    }
    return out;
}

/** Strips the `javascope.` prefix from a VS Code configuration key. */
export function stripPrefix(section: Record<string, unknown>): Partial<SettingsFile> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(section)) {
        const stripped = key.startsWith('javascope.') ? key.substring('javascope.'.length) : key;
        setDeep(out, stripped, value);
    }
    return out as Partial<SettingsFile>;
}

function setDeep(target: Record<string, unknown>, dotted: string, value: unknown): void {
    const parts = dotted.split('.');
    let node = target;
    for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (typeof node[p] !== 'object' || node[p] === null) {
            node[p] = {};
        }
        node = node[p] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = value;
}

export type { SettingOrigin };
export { defaultSettings };
