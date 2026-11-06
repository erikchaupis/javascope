import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConfigManager } from './configuration/configManager';
import { SettingsPatch } from './configuration/schema';
import { ConfigurationLocation, EffectiveSettings, SettingsFile } from './configuration/types';
import { registerJavaScopeCommands } from './commands';
import { FormatController } from './formatter/formatController';
import { applyFormatterOverrides, FORMAT_PREVIEW_SAMPLE, JSP_FORMAT_PREVIEW_SAMPLE, parseFormatterProfile } from './formatter/formatterOptions';
import { JdtFormatterService } from './formatter/jdtService';
import { JspProfileFile, normalizeJspProfile } from './formatter/jsp/profile';
import { ProfileManager } from './formatter/profileManager';
import { JavaScopeServices } from './services';
import { BUILTIN_THEMES, getBuiltinTheme, getCounterpartThemeId, getThemePreviewStyles, JavaScopeTheme } from './themes/builtinThemes';
import { discoverCustomThemes, LoadedCustomTheme } from './themes/customThemes';
import { ThemeManager } from './themes/themeManager';
import { AdminPanel } from './webview/AdminPanel';
import { AdminState, WebviewMessage } from './webview/messages';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const workspaceDir = workspaceRoot ? path.join(workspaceRoot, '.javascope') : null;
    const config = new ConfigManager({ workspaceConfigDir: workspaceDir });

    const profiles = new ProfileManager({
        userConfigDir: config.userConfigDir,
        workspaceConfigDir: config.workspaceConfigDir ?? null,
        builtinJavaProfilePath: path.join(context.extensionPath, 'formatters', 'java', 'default.xml'),
        builtinJspProfilePath: path.join(context.extensionPath, 'formatters', 'jsp', 'default.json'),
    });

    const themes = new ThemeManager();
    const jdt = new JdtFormatterService({
        jarPath: path.join(context.extensionPath, 'formatters', 'java', 'bin', 'javascope-jdt-formatter.jar'),
    });
    const formatting = new FormatController(config, profiles, jdt);

    let customThemes: LoadedCustomTheme[] = [];
    let customThemeErrors: Array<{ path: string; error: string }> = [];

    const discoverThemes = (): void => {
        const dirs: Array<{ dir: string; origin: 'user' | 'workspace' }> = [
            { dir: config.userConfigDir, origin: 'user' },
        ];
        if (config.workspaceConfigDir) {
            dirs.push({ dir: config.workspaceConfigDir, origin: 'workspace' });
        }
        const result = discoverCustomThemes(dirs);
        customThemes = result.themes;
        customThemeErrors = result.errors;
    };

    const applyActiveTheme = async (): Promise<void> => {
        const settings = config.settings;
        if (!settings.enabled || !settings.themes.enabled) {
            await themes.removeCustomization();
            return;
        }
        const id = settings.themes.active;
        let theme: JavaScopeTheme | null = getBuiltinTheme(id);
        if (!theme && id.startsWith('custom:')) {
            theme = customThemes.find((t) => t.id === id)?.theme ?? null;
        }
        if (!theme) {
            await themes.removeCustomization();
            return;
        }
        await themes.applyTheme(theme, false, settings.themes.jspTemplates?.enabled ?? false);
        maybeWarnContrastMismatch(theme);
    };

    // Warns once per scheme when its type (light/dark) fights the workbench
    // theme — e.g. a light scheme paints black type names on a dark theme.
    let mismatchWarnedFor: string | null = null;
    const maybeWarnContrastMismatch = (theme: JavaScopeTheme): void => {
        const kind = vscode.window.activeColorTheme.kind;
        const workbenchDark =
            kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
        if ((theme.type === 'dark') === workbenchDark) {
            mismatchWarnedFor = null;
            return;
        }
        if (mismatchWarnedFor === theme.id) {
            return;
        }
        mismatchWarnedFor = theme.id;
        const counterpart = getCounterpartThemeId(theme.id);
        const counterpartTheme = counterpart ? getBuiltinTheme(counterpart) : null;
        const workbenchLabel = workbenchDark ? 'dark' : 'light';
        const actions: string[] = counterpartTheme ? [`Switch to ${counterpartTheme.name}`] : [];
        actions.push('Keep anyway');
        void vscode.window
            .showWarningMessage(
                `JavaScope: "${theme.name}" is a ${theme.type} scheme, but the workbench theme is ${workbenchLabel} — colors may look off.`,
                ...actions,
            )
            .then((choice) => {
                if (counterpartTheme && choice === `Switch to ${counterpartTheme.name}`) {
                    config.update({ themes: { active: counterpartTheme.id } });
                }
            });
    };

    const services: JavaScopeServices = {
        config,
        profiles,
        themes,
        formatting,
        jdt,
        refreshThemes: async () => {
            discoverThemes();
            await applyActiveTheme();
        },
        reloadAll: async () => {
            config.reload();
            syncVscodeLayer();
            discoverThemes();
            await applyActiveTheme();
            AdminPanel.refresh();
        },
    };

    const readVscodeLayer = (): void => {
        syncVscodeLayer();
    };

    function syncVscodeLayer(): void {
        const keys = [
            'enabled',
            'configurationLocation',
            'themes.enabled',
            'themes.active',
            'themes.jspTemplates.enabled',
            'javaFormatter.enabled',
            'javaFormatter.activeProfile',
            'javaFormatter.formatOnSave',
            'jspFormatter.enabled',
            'jspFormatter.activeProfile',
            'jspFormatter.formatOnSave',
        ];
        const user: Record<string, unknown> = {};
        const workspace: Record<string, unknown> = {};
        const section = vscode.workspace.getConfiguration('javascope');
        for (const key of keys) {
            const inspected = section.inspect(key);
            if (inspected?.globalValue !== undefined) {
                setNested(user, key, inspected.globalValue);
            }
            if (inspected?.workspaceValue !== undefined) {
                setNested(workspace, key, inspected.workspaceValue);
            }
        }
        config.setVscodeLayer(user as Partial<SettingsFile>, workspace as Partial<SettingsFile>);
    }

    // File watching for .javascope directories (settings, themes, profiles).
    const watchDisposables: Array<{ close(): void }> = [];
    const setupWatchers = (): void => {
        for (const w of watchDisposables.splice(0)) {
            try {
                w.close();
            } catch {
                // ignore
            }
        }
        config.watch((dir, onChange) => {
            // Defer require so unit tests never load chokidar.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const chokidar = require('chokidar') as typeof import('chokidar');
            const watcher = chokidar.watch(dir, { ignoreInitial: true, depth: 4 });
            let timer: NodeJS.Timeout | undefined;
            watcher.on('all', () => {
                if (timer) {
                    clearTimeout(timer);
                }
                timer = setTimeout(() => onChange('watch'), 250);
            });
            return [watcher];
        });
    };

    readVscodeLayer();
    discoverThemes();
    setupWatchers();
    await applyActiveTheme();

    config.on('change', () => {
        void (async () => {
            await applyActiveTheme();
            AdminPanel.refresh();
        })();
    });

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('javascope')) {
                syncVscodeLayer();
                void (async () => {
                    await applyActiveTheme();
                    AdminPanel.refresh();
                })();
            }
        }),
        // The themes tab shows a dark/light mismatch hint against the
        // workbench theme; keep it fresh when the user switches theme.
        vscode.window.onDidChangeActiveColorTheme(() => {
            void AdminPanel.refresh();
        }),
    );

    // ---- Admin panel delegate ----
    const buildState = async (): Promise<AdminState> => {
        const s = config.settings;
        const e: EffectiveSettings = config.effective;
        return {
            settings: e,
            configStatus: {
                userDir: config.userConfigDir,
                workspaceDir: config.workspaceConfigDir ?? null,
                hasUserSettings: config.hasUserConfig,
                hasWorkspaceSettings: config.hasWorkspaceConfig,
                targetDir: config.resolveTarget(),
                problems: config.problems,
            },
            themes: {
                enabled: s.themes.enabled,
                active: s.themes.active,
                jspTemplatesEnabled: s.themes.jspTemplates?.enabled ?? false,
                workbenchKind:
                    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
                    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast
                        ? 'dark'
                        : 'light',
                builtins: BUILTIN_THEMES.map((t) => ({
                    id: t.id,
                    name: t.name,
                    type: t.type,
                    preview: { ...t.colors },
                    previewStyles: getThemePreviewStyles(t),
                })),
                customs: customThemes.map((t) => ({
                    id: t.id,
                    name: t.name,
                    type: t.type,
                    origin: t.origin,
                    preview: { ...t.theme.colors },
                    previewStyles: getThemePreviewStyles(t.theme),
                })),
                errors: customThemeErrors,
            },
            javaFormatter: {
                enabled: s.javaFormatter.enabled,
                activeProfile: s.javaFormatter.activeProfile,
                formatOnSave: s.javaFormatter.formatOnSave,
                profiles: profiles.listProfiles('java'),
                runtimeAvailable: await jdt.isJavaAvailable(),
                jarPresent: jdt.isJarPresent(),
            },
            jspFormatter: {
                enabled: s.jspFormatter.enabled,
                activeProfile: s.jspFormatter.activeProfile,
                formatOnSave: s.jspFormatter.formatOnSave,
                profiles: profiles.listProfiles('jsp'),
            },
            commands: JAVA_SCOPE_COMMANDS,
        };
    };

    const handleMessage = async (message: WebviewMessage): Promise<Record<string, unknown> | void> => {
        switch (message.type) {
            case 'ready':
            case 'reload':
                await services.reloadAll();
                return;
            case 'updateSettings':
                config.update(message.patch as SettingsPatch);
                await services.reloadAll();
                return;
            case 'setTheme':
                // Selects the scheme only — never re-enables customization on
                // its own, so clicking a card cannot undo a deliberate disable.
                config.update({ themes: { active: message.id } });
                await services.reloadAll();
                return;
            case 'toggleThemes':
                config.update({ themes: { enabled: message.enabled } });
                await services.reloadAll();
                return;
            case 'toggleJspTemplates':
                config.update({ themes: { jspTemplates: { enabled: message.enabled } } });
                await services.reloadAll();
                return;
            case 'setActiveProfile':
                config.update(
                    message.kind === 'java'
                        ? { javaFormatter: { activeProfile: message.id } }
                        : { jspFormatter: { activeProfile: message.id } },
                );
                await services.reloadAll();
                return;
            case 'setFormatOnSave':
                config.update(
                    message.kind === 'java'
                        ? { javaFormatter: { formatOnSave: message.value } }
                        : { jspFormatter: { formatOnSave: message.value } },
                );
                await services.reloadAll();
                return;
            case 'toggleFormatter':
                config.update(
                    message.kind === 'java'
                        ? { javaFormatter: { enabled: message.enabled } }
                        : { jspFormatter: { enabled: message.enabled } },
                );
                await services.reloadAll();
                return;
            case 'createProfile':
                await profiles.createProfile({
                    kind: message.kind,
                    name: message.name,
                    // New profiles are global by default so they can be reused
                    // across projects; the webview may opt into workspace scope.
                    origin: message.origin ?? 'user',
                    duplicateFrom: message.duplicateFrom,
                });
                await services.reloadAll();
                return;
            case 'duplicateProfile': {
                const source = profiles.getProfile(message.id);
                if (!source) {
                    throw new Error(`profile not found: ${message.id}`);
                }
                await profiles.createProfile({
                    kind: source.kind,
                    name: `${source.name} copy`,
                    // Duplicates land in the global (user) config so reused
                    // styles travel across projects.
                    origin: 'user',
                    duplicateFrom: message.id,
                });
                await services.reloadAll();
                return;
            }
            case 'renameProfile': {
                const newId = await profiles.renameProfile(message.id, message.name);
                const s = config.settings;
                if (s.javaFormatter.activeProfile === message.id) {
                    config.update({ javaFormatter: { activeProfile: newId } });
                }
                if (s.jspFormatter.activeProfile === message.id) {
                    config.update({ jspFormatter: { activeProfile: newId } });
                }
                await services.reloadAll();
                return;
            }
            case 'deleteProfile': {
                const active = config.settings;
                if (
                    active.javaFormatter.activeProfile === message.id ||
                    active.jspFormatter.activeProfile === message.id
                ) {
                    throw new Error('cannot delete the active profile; switch to another profile first');
                }
                profiles.deleteProfile(message.id);
                await services.reloadAll();
                return;
            }
            case 'getProfileContent': {
                const withContent = await profiles.getProfileContent(message.id);
                const content =
                    withContent.kind === 'jsp'
                        ? JSON.stringify(withContent.content, null, 2)
                        : fsReadIfPossible(withContent.path);
                return { content };
            }
            case 'getFormatterOptions': {
                const withContent = await profiles.getProfileContent(message.id);
                if (withContent.kind !== 'java') {
                    throw new Error('the options editor is only available for Java profiles');
                }
                const xml = fsReadIfPossible(withContent.path);
                const settings = parseFormatterProfile(xml).settings;
                return { settings: Object.fromEntries(settings) };
            }
            case 'formatPreview': {
                const withContent = await profiles.getProfileContent(message.id);
                const xml = fsReadIfPossible(withContent.path);
                const merged = applyFormatterOverrides(xml, message.settings);
                const tmp = path.join(os.tmpdir(), `javascope-preview-${process.pid}-${Date.now()}.xml`);
                fs.writeFileSync(tmp, merged, 'utf8');
                try {
                    const formatted = await jdt.format({
                        source: FORMAT_PREVIEW_SAMPLE,
                        profilePath: tmp,
                        kind: 'compilation-unit',
                        timeoutMs: 30000,
                    });
                    return { formatted };
                } finally {
                    try {
                        fs.unlinkSync(tmp);
                    } catch {
                        // ignore
                    }
                }
            }
            case 'updateFormatterOptions': {
                const profile = profiles.getProfile(message.id);
                if (!profile) {
                    throw new Error(`profile not found: ${message.id}`);
                }
                if (profile.kind !== 'java') {
                    throw new Error('the options editor is only available for Java profiles');
                }
                const withContent = await profiles.getProfileContent(message.id);
                const xml = fsReadIfPossible(withContent.path);
                const merged = applyFormatterOverrides(xml, message.settings);
                await profiles.updateProfileContent(message.id, merged);
                await services.reloadAll();
                return;
            }
            case 'getJspProfileOptions': {
                const profile = profiles.getProfile(message.id);
                if (!profile || profile.kind !== 'jsp') {
                    throw new Error(`JSP profile not found: ${message.id}`);
                }
                const withContent = await profiles.getProfileContent(message.id);
                return { profile: withContent.content };
            }
            case 'jspFormatPreview': {
                const profile = profiles.getProfile(message.id);
                if (!profile || profile.kind !== 'jsp') {
                    throw new Error(`JSP profile not found: ${message.id}`);
                }
                const candidate = normalizeJspProfile(message.profile as JspProfileFile, profile.id);
                const formatted = await formatting.formatJspPreview(candidate, JSP_FORMAT_PREVIEW_SAMPLE);
                return { formatted };
            }
            case 'updateProfileContent': {
                const profile = profiles.getProfile(message.id);
                if (!profile) {
                    throw new Error(`profile not found: ${message.id}`);
                }
                const content = profile.kind === 'jsp' ? JSON.parse(message.content) : message.content;
                await profiles.updateProfileContent(message.id, content);
                await services.reloadAll();
                return;
            }
            case 'importProfile': {
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    filters:
                        message.kind === 'java' ? { 'Eclipse formatter profile': ['xml'] } : { 'JSP formatter profile': ['json'] },
                });
                if (!picked || picked.length === 0) {
                    return;
                }
                await profiles.importProfile({
                    kind: message.kind,
                    sourcePath: picked[0].fsPath,
                    // Imported profiles are global by default for reuse across
                    // projects.
                    origin: 'user',
                });
                await services.reloadAll();
                return;
            }
            case 'exportProfile': {
                const profile = profiles.getProfile(message.id);
                if (!profile) {
                    throw new Error(`profile not found: ${message.id}`);
                }
                const dest = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(path.join(vscode.env.appRoot, profile.name + (profile.kind === 'java' ? '.xml' : '.json'))),
                    filters: profile.kind === 'java' ? { XML: ['xml'] } : { JSON: ['json'] },
                });
                if (!dest) {
                    return;
                }
                await profiles.exportProfile(message.id, dest.fsPath);
                vscode.window.showInformationMessage(`JavaScope: profile exported to ${dest.fsPath}`);
                return;
            }
            case 'selectConfigLocation':
                config.update({ configurationLocation: message.location as ConfigurationLocation });
                await services.reloadAll();
                return;
            case 'openConfigDir': {
                const dir = message.target === 'user' ? config.userConfigDir : config.workspaceConfigDir;
                if (!dir) {
                    throw new Error('no workspace folder is open');
                }
                fs.mkdirSync(dir, { recursive: true });
                await vscode.env.openExternal(vscode.Uri.file(dir));
                return;
            }
        }
    };

    registerJavaScopeCommands(context, services, {
        openAdmin: (tab) =>
            AdminPanel.show(
                context.extensionUri,
                {
                    getState: () => buildState(),
                    handleMessage: (m) => handleMessage(m),
                },
                tab,
            ),
    });

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('javascope.quickAccess', new QuickAccessProvider()),
    );
}

/**
 * Activity-bar entries: open the administration panel directly on one of its
 * configuration tabs.
 */
class QuickAccessProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): vscode.TreeItem[] {
        const entries: Array<{ label: string; tab: string; icon: string }> = [
            { label: 'General', tab: 'general', icon: 'settings-gear' },
            { label: 'Themes & Syntax', tab: 'themes', icon: 'symbol-color' },
            { label: 'Java Formatter', tab: 'java', icon: 'file-code' },
            { label: 'JSP Formatter', tab: 'jsp', icon: 'file-code' },
            { label: 'Keyboard Shortcuts', tab: 'shortcuts', icon: 'keyboard' },
        ];
        return entries.map(({ label, tab, icon }) => {
            const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
            item.command = { command: 'javascope.openAdmin', title: label, arguments: [tab] };
            item.iconPath = new vscode.ThemeIcon(icon);
            return item;
        });
    }
}

const JAVA_SCOPE_COMMANDS = [
    { id: 'javascope.openAdmin', title: 'JavaScope: Open Administration' },
    { id: 'javascope.formatJava', title: 'JavaScope: Format Java' },
    { id: 'javascope.formatJsp', title: 'JavaScope: Format JSP' },
    { id: 'javascope.selectJavaProfile', title: 'JavaScope: Select Java Formatter Profile' },
    { id: 'javascope.selectJspProfile', title: 'JavaScope: Select JSP Formatter Profile' },
    { id: 'javascope.toggleJavaFormatter', title: 'JavaScope: Toggle Java Formatter' },
    { id: 'javascope.toggleJspFormatter', title: 'JavaScope: Toggle JSP Formatter' },
    { id: 'javascope.toggleThemes', title: 'JavaScope: Toggle JavaScope Themes' },
    { id: 'javascope.reloadConfiguration', title: 'JavaScope: Reload Configuration' },
];

function fsReadIfPossible(filePath: string | undefined): string {
    if (!filePath) {
        return '';
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs') as typeof import('fs');
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        return '';
    }
}

function setNested(target: Record<string, unknown>, dotted: string, value: unknown): void {
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

export function deactivate(): void {
    // VS Code disposes registered subscriptions; theme customization persists
    // by design so the selected scheme survives reloads.
}
