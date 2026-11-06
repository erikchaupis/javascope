import * as path from 'path';
import * as vscode from 'vscode';
import { buildAdminHtml } from './buildAdminHtml';
import { AdminState, isWebviewMessage, WebviewMessage } from './messages';

export interface AdminPanelDelegate {
    getState(): Promise<AdminState>;
    handleMessage(message: WebviewMessage): Promise<Record<string, unknown> | void>;
}

/**
 * Hosts the JavaScope Administration webview. Serves the Vite-built React
 * app with a strict Content Security Policy and per-load script nonces.
 */
export class AdminPanel {
    private static current: AdminPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];

    static show(extensionUri: vscode.Uri, delegate: AdminPanelDelegate, tab?: string): void {
        if (AdminPanel.current) {
            AdminPanel.current.panel.reveal();
            void AdminPanel.current.postState(tab);
            return;
        }
        AdminPanel.current = new AdminPanel(extensionUri, delegate, tab);
    }

    /** Pushes a fresh state snapshot to the visible panel, if any. */
    static refresh(): void {
        if (AdminPanel.current) {
            void AdminPanel.current.postState();
        }
    }

    private constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly delegate: AdminPanelDelegate,
        tab?: string,
    ) {
        this.panel = vscode.window.createWebviewPanel(
            'javascope.admin',
            'JavaScope Administration',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview', 'admin', 'dist')],
            },
        );
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(
            (raw: unknown) => this.onMessage(raw),
            null,
            this.disposables,
        );
        void this.render(tab);
    }

    async refresh(): Promise<void> {
        await this.postState();
    }

    private async render(tab?: string): Promise<void> {
        this.panel.webview.html = this.buildHtml();
        await this.postState(tab);
    }

    private async postState(tab?: string): Promise<void> {
        const state = await this.delegate.getState();
        await this.panel.webview.postMessage({ type: 'state', state, ...(tab ? { tab } : {}) });
    }

    private async onMessage(raw: unknown): Promise<void> {
        if (!isWebviewMessage(raw)) {
            console.warn('JavaScope admin: rejected malformed webview message', raw);
            return;
        }
        try {
            const reply = await this.delegate.handleMessage(raw);
            if (raw.type === 'getProfileContent') {
                await this.panel.webview.postMessage({ type: 'profileContent', id: raw.id, ...(reply ?? {}) });
                return;
            }
            if (raw.type === 'getFormatterOptions') {
                await this.panel.webview.postMessage({ type: 'formatterOptions', id: raw.id, ...(reply ?? {}) });
                return;
            }
            if (raw.type === 'formatPreview') {
                await this.panel.webview.postMessage({ type: 'formatPreviewResult', id: raw.id, ...(reply ?? {}) });
                return;
            }
            if (raw.type === 'getJspProfileOptions') {
                await this.panel.webview.postMessage({ type: 'jspProfileOptions', id: raw.id, ...(reply ?? {}) });
                return;
            }
            if (raw.type === 'jspFormatPreview') {
                await this.panel.webview.postMessage({ type: 'jspFormatPreviewResult', id: raw.id, ...(reply ?? {}) });
                return;
            }
            await this.postState();
        } catch (e) {
            await this.panel.webview.postMessage({
                type: 'error',
                message: e instanceof Error ? e.message : String(e),
            });
        }
    }

    private buildHtml(): string {
        const dist = path.join(this.extensionUri.fsPath, 'webview', 'admin', 'dist');
        return buildAdminHtml(dist, this.panel.webview.cspSource, randomNonce());
    }

    dispose(): void {
        AdminPanel.current = undefined;
        for (const d of this.disposables) {
            d.dispose();
        }
        this.panel.dispose();
    }
}

function randomNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
