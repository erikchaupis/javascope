import * as vscode from 'vscode';
import { JavaScopeServices } from './services';
import { FormatterProfile } from './formatter/profileManager';

export interface CommandCallbacks {
    openAdmin(tab?: string): void;
}

export function registerJavaScopeCommands(
    context: vscode.ExtensionContext,
    services: JavaScopeServices,
    callbacks: CommandCallbacks,
): void {
    const { config, profiles, formatting } = services;

    const register = (id: string, fn: (...args: unknown[]) => unknown): void => {
        context.subscriptions.push(vscode.commands.registerCommand(id, fn));
    };

    register('javascope.openAdmin', (...args: unknown[]) => callbacks.openAdmin(typeof args[0] === 'string' ? args[0] : undefined));

    register('javascope.formatJava', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'java') {
            vscode.window.showInformationMessage('JavaScope: open a Java file first.');
            return false;
        }
        return formatting.formatJavaDocument(editor.document);
    });

    register('javascope.formatJsp', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'jsp') {
            vscode.window.showInformationMessage('JavaScope: open a JSP file first.');
            return false;
        }
        return formatting.formatJspDocument(editor.document);
    });

    register('javascope.formatJavaSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'java') {
            vscode.window.showInformationMessage('JavaScope: open a Java file first.');
            return false;
        }
        return formatting.formatJavaSelection(editor);
    });

    register('javascope.selectJavaProfile', async () => {
        await pickProfile(profiles.listProfiles('java'), async (picked) => {
            config.update({ javaFormatter: { activeProfile: picked.id } });
            await services.reloadAll();
            vscode.window.showInformationMessage(`JavaScope: active Java profile → ${picked.name}`);
        });
    });

    register('javascope.selectJspProfile', async () => {
        await pickProfile(profiles.listProfiles('jsp'), async (picked) => {
            config.update({ jspFormatter: { activeProfile: picked.id } });
            await services.reloadAll();
            vscode.window.showInformationMessage(`JavaScope: active JSP profile → ${picked.name}`);
        });
    });

    register('javascope.toggleJavaFormatter', async () => {
        const next = !config.settings.javaFormatter.enabled;
        config.update({ javaFormatter: { enabled: next } });
        await services.reloadAll();
        vscode.window.showInformationMessage(`JavaScope: Java formatter ${next ? 'enabled' : 'disabled'}.`);
    });

    register('javascope.toggleJspFormatter', async () => {
        const next = !config.settings.jspFormatter.enabled;
        config.update({ jspFormatter: { enabled: next } });
        await services.reloadAll();
        vscode.window.showInformationMessage(`JavaScope: JSP formatter ${next ? 'enabled' : 'disabled'}.`);
    });

    register('javascope.toggleThemes', async () => {
        const next = !config.settings.themes.enabled;
        config.update({ themes: { enabled: next } });
        await services.reloadAll();
        vscode.window.showInformationMessage(`JavaScope: color customization ${next ? 'enabled' : 'disabled'}.`);
    });

    register('javascope.reloadConfiguration', async () => {
        await services.reloadAll();
        vscode.window.showInformationMessage('JavaScope: configuration reloaded.');
    });
}

async function pickProfile(
    profiles: FormatterProfile[],
    onPick: (profile: FormatterProfile) => Promise<void>,
): Promise<void> {
    if (profiles.length === 0) {
        vscode.window.showInformationMessage('JavaScope: no formatter profiles found.');
        return;
    }
    const items = profiles.map((p) => ({
        label: p.name,
        description: `$(folder) ${p.origin}`,
        detail: p.id,
        profile: p,
    }));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select the active JavaScope formatter profile',
    });
    if (picked) {
        await onPick(picked.profile);
    }
}
