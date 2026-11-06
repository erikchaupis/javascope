import { EffectiveSettings } from '../configuration/types';
import { FormatterProfile } from '../formatter/profileManager';

/** Full state snapshot pushed from the extension to the admin webview. */
export interface AdminState {
    settings: EffectiveSettings;
    configStatus: {
        userDir: string;
        workspaceDir: string | null;
        hasUserSettings: boolean;
        hasWorkspaceSettings: boolean;
        targetDir: 'user' | 'workspace';
        problems: Array<{ location: string; problems: string[] }>;
    };
    themes: {
        enabled: boolean;
        active: string;
        /** Whether the active scheme also paints the HTML template parts of .jsp files. */
        jspTemplatesEnabled: boolean;
        /** Whether the current VS Code workbench color theme is dark. */
        workbenchKind: 'light' | 'dark';
        builtins: Array<{
            id: string;
            name: string;
            type: string;
            preview?: Record<string, string>;
            previewStyles?: { keyword?: string; constant?: string; javadocTag?: string };
        }>;
        customs: Array<{
            id: string;
            name: string;
            type: string;
            origin: string;
            preview?: Record<string, string>;
            previewStyles?: { keyword?: string; constant?: string; javadocTag?: string };
        }>;
        errors: Array<{ path: string; error: string }>;
    };
    javaFormatter: {
        enabled: boolean;
        activeProfile: string;
        formatOnSave: boolean;
        profiles: FormatterProfile[];
        runtimeAvailable: boolean;
        jarPresent: boolean;
    };
    jspFormatter: {
        enabled: boolean;
        activeProfile: string;
        formatOnSave: boolean;
        profiles: FormatterProfile[];
    };
    commands: Array<{ id: string; title: string }>;
}

/** Messages the webview may send. All are validated before handling. */
export type WebviewMessage =
    | { type: 'ready' }
    | { type: 'updateSettings'; patch: Record<string, unknown> }
    | { type: 'setTheme'; id: string }
    | { type: 'toggleThemes'; enabled: boolean }
    | { type: 'toggleJspTemplates'; enabled: boolean }
    | { type: 'setActiveProfile'; kind: 'java' | 'jsp'; id: string }
    | { type: 'setFormatOnSave'; kind: 'java' | 'jsp'; value: boolean }
    | { type: 'toggleFormatter'; kind: 'java' | 'jsp'; enabled: boolean }
    | { type: 'createProfile'; kind: 'java' | 'jsp'; name: string; duplicateFrom?: string; origin?: 'user' | 'workspace' }
    | { type: 'duplicateProfile'; id: string }
    | { type: 'renameProfile'; id: string; name: string }
    | { type: 'deleteProfile'; id: string }
    | { type: 'getProfileContent'; id: string }
    | { type: 'updateProfileContent'; id: string; content: string }
    | { type: 'getFormatterOptions'; id: string }
    | { type: 'formatPreview'; id: string; settings: Record<string, string> }
    | { type: 'updateFormatterOptions'; id: string; settings: Record<string, string> }
    | { type: 'getJspProfileOptions'; id: string }
    | { type: 'jspFormatPreview'; id: string; profile: Record<string, unknown> }
    | { type: 'importProfile'; kind: 'java' | 'jsp' }
    | { type: 'exportProfile'; id: string }
    | { type: 'selectConfigLocation'; location: 'auto' | 'user' | 'workspace' }
    | { type: 'openConfigDir'; target: 'user' | 'workspace' }
    | { type: 'reload' };

function isStringMap(value: unknown): value is Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string');
}

export function isWebviewMessage(raw: unknown): raw is WebviewMessage {
    if (raw === null || typeof raw !== 'object') {
        return false;
    }
    const m = raw as Record<string, unknown>;
    if (typeof m.type !== 'string') {
        return false;
    }
    switch (m.type) {
        case 'ready':
        case 'reload':
        case 'importProfile':
            return true;
        case 'updateSettings':
            return typeof m.patch === 'object' && m.patch !== null;
        case 'setTheme':
            return typeof m.id === 'string';
        case 'toggleThemes':
        case 'toggleJspTemplates':
        case 'setFormatOnSave':
        case 'toggleFormatter':
            return typeof m.enabled === 'boolean' || typeof m.value === 'boolean';
        case 'setActiveProfile':
            return (m.kind === 'java' || m.kind === 'jsp') && typeof m.id === 'string';
        case 'getFormatterOptions':
        case 'formatPreview':
        case 'updateFormatterOptions':
            return typeof m.id === 'string' && isStringMap(m.settings ?? {});
        case 'getJspProfileOptions':
            return typeof m.id === 'string';
        case 'jspFormatPreview':
            return (
                typeof m.id === 'string' &&
                typeof m.profile === 'object' &&
                m.profile !== null &&
                !Array.isArray(m.profile)
            );
        case 'createProfile':
            return (m.kind === 'java' || m.kind === 'jsp') && typeof m.name === 'string' && (m.origin === undefined || m.origin === 'user' || m.origin === 'workspace');
        case 'duplicateProfile':
        case 'deleteProfile':
        case 'getProfileContent':
        case 'exportProfile':
            return typeof m.id === 'string';
        case 'renameProfile':
            return typeof m.id === 'string' && typeof m.name === 'string';
        case 'updateProfileContent':
            return typeof m.id === 'string' && typeof m.content === 'string';
        case 'selectConfigLocation':
            return m.location === 'auto' || m.location === 'user' || m.location === 'workspace';
        case 'openConfigDir':
            return m.target === 'user' || m.target === 'workspace';
        default:
            return false;
    }
}
