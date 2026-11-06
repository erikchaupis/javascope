import * as vscode from 'vscode';
import { ConfigManager } from '../configuration/configManager';
import { JdtFormatterService, JdtFormatKind } from './jdtService';
import { formatJsp } from './jsp/formatter';
import { JspFormatterProfile } from './jsp/profile';
import { JavaSnippetKind } from './jsp/renderer';
import { ProfileManager } from './profileManager';

/**
 * Coordinates Java and JSP formatting: resolves the active profile, runs the
 * Eclipse JDT CLI for Java sources (including JSP scriptlet snippets), and
 * applies the JSP engine for JSP documents. Also wires format-on-save.
 */
export class FormatController implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private output: vscode.OutputChannel;

    constructor(
        private readonly config: ConfigManager,
        private readonly profiles: ProfileManager,
        private readonly jdt: JdtFormatterService,
    ) {
        this.output = vscode.window.createOutputChannel('JavaScope Formatter');
        this.disposables.push(this.output);
        this.disposables.push(
            vscode.workspace.onWillSaveTextDocument((e) => {
                void this.onWillSave(e);
            }),
        );
    }

    isJavaFormatterEnabled(): boolean {
        const s = this.config.settings;
        return s.enabled && s.javaFormatter.enabled;
    }

    isJspFormatterEnabled(): boolean {
        const s = this.config.settings;
        return s.enabled && s.jspFormatter.enabled;
    }

    async formatJavaDocument(document: vscode.TextDocument): Promise<boolean> {
        if (document.languageId !== 'java') {
            return false;
        }
        if (!this.isJavaFormatterEnabled()) {
            vscode.window.showInformationMessage('JavaScope Java formatter is disabled.');
            return false;
        }
        const settings = this.config.settings;
        const profile = this.profiles.getProfile(settings.javaFormatter.activeProfile);
        const profilePath = profile?.path;
        if (!profilePath) {
            vscode.window.showErrorMessage(`JavaScope: Java formatter profile not found: ${settings.javaFormatter.activeProfile}`);
            return false;
        }
        try {
            const source = document.getText();
            const formatted = await this.jdt.format({
                source,
                profilePath,
                profileName: profile.origin === 'builtin' ? undefined : profile.name,
                kind: 'compilation-unit' as JdtFormatKind,
            });
            return await this.applyFullDocumentEdit(document, formatted);
        } catch (e) {
            this.reportError('Java formatting failed', e);
            return false;
        }
    }

    /**
     * Formats the active editor's selection with the Eclipse JDT formatter.
     * The selected text is fed to the CLI as a standalone snippet (statements,
     * then class-body, then compilation-unit) and the result replaces exactly
     * the selected range — surrounding code is never touched.
     */
    async formatJavaSelection(editor: vscode.TextEditor): Promise<boolean> {
        const document = editor.document;
        if (document.languageId !== 'java') {
            return false;
        }
        if (!this.isJavaFormatterEnabled()) {
            vscode.window.showInformationMessage('JavaScope Java formatter is disabled.');
            return false;
        }
        if (editor.selection.isEmpty) {
            vscode.window.showInformationMessage('JavaScope: select some Java code first.');
            return false;
        }
        const settings = this.config.settings;
        const profile = this.profiles.getProfile(settings.javaFormatter.activeProfile);
        const profilePath = profile?.path;
        if (!profilePath) {
            vscode.window.showErrorMessage(`JavaScope: Java formatter profile not found: ${settings.javaFormatter.activeProfile}`);
            return false;
        }
        const snippet = document.getText(editor.selection);
        try {
            const kinds: JdtFormatKind[] = ['statements', 'class-body', 'compilation-unit'];
            for (const kind of kinds) {
                const formatted = await this.jdt.format({
                    source: snippet,
                    profilePath,
                    profileName: profile.origin === 'builtin' ? undefined : profile.name,
                    kind,
                    timeoutMs: 30000,
                });
                if (formatted !== snippet) {
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(document.uri, editor.selection, formatted);
                    return await vscode.workspace.applyEdit(edit);
                }
            }
            return true; // JDT saw nothing to change in the selection
        } catch (e) {
            this.reportError('Java selection formatting failed', e);
            return false;
        }
    }

    async formatJspDocument(document: vscode.TextDocument): Promise<boolean> {
        if (document.languageId !== 'jsp') {
            return false;
        }
        if (!this.isJspFormatterEnabled()) {
            vscode.window.showInformationMessage('JavaScope JSP formatter is disabled.');
            return false;
        }
        try {
            const settings = this.config.settings;
            const profile = await this.profiles.getJspProfile(settings.jspFormatter.activeProfile);
            const formatJava =
                profile.formatScriptletJava && this.isJavaFormatterEnabled()
                    ? (source: string, kind: JavaSnippetKind) => this.formatJavaSnippet(source, kind, settings.javaFormatter.activeProfile)
                    : undefined;
            const formatted = await formatJsp(document.getText(), { profile, formatJava });
            return await this.applyFullDocumentEdit(document, formatted);
        } catch (e) {
            this.reportError('JSP formatting failed', e);
            return false;
        }
    }

    /**
     * Formats a JSP sample with a candidate profile (admin live preview). Runs
     * fully in-process; scriptlet Java goes through the JDT CLI only when the
     * candidate profile enables it and a Java runtime is available.
     */
    async formatJspPreview(profile: JspFormatterProfile, source: string): Promise<string> {
        const settings = this.config.settings;
        const javaProfile = this.profiles.getProfile(settings.javaFormatter.activeProfile);
        const formatJava =
            profile.formatScriptletJava && this.isJavaFormatterEnabled() && javaProfile?.path
                ? (snippet: string, kind: JavaSnippetKind) =>
                      this.formatJavaSnippet(snippet, kind, settings.javaFormatter.activeProfile)
                : undefined;
        return formatJsp(source, { profile, formatJava });
    }

    private async formatJavaSnippet(source: string, kind: JavaSnippetKind, profileId: string): Promise<string> {
        const profile = this.profiles.getProfile(profileId);
        const profilePath = profile?.path ?? this.profiles.getProfile('builtin:java:eclipse-default')?.path;
        if (!profilePath) {
            throw new Error('no Java formatter profile available for scriptlet formatting');
        }
        const jdtKind: JdtFormatKind =
            kind === 'statements' ? 'statements' : kind === 'expression' ? 'expression' : 'class-body';
        return this.jdt.format({
            source,
            profilePath,
            profileName: profile?.origin === 'builtin' ? undefined : profile?.name,
            kind: jdtKind,
            timeoutMs: 30000,
        });
    }

    private async applyFullDocumentEdit(document: vscode.TextDocument, formatted: string): Promise<boolean> {
        const editor = await this.getEditorFor(document);
        if (!editor) {
            return false;
        }
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
        );
        if (document.getText() === formatted) {
            return true; // already formatted (idempotency / no changes needed)
        }
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, fullRange, formatted);
        return vscode.workspace.applyEdit(edit);
    }

    private async getEditorFor(document: vscode.TextDocument): Promise<vscode.TextEditor | null> {
        const visible = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === document.uri.toString());
        if (visible) {
            return visible;
        }
        try {
            return await vscode.window.showTextDocument(document);
        } catch {
            return null;
        }
    }

    private async onWillSave(e: vscode.TextDocumentWillSaveEvent): Promise<void> {
        const doc = e.document;
        try {
            if (doc.languageId === 'java' && this.isJavaFormatterEnabled() && this.config.settings.javaFormatter.formatOnSave) {
                const settings = this.config.settings;
                const profile = this.profiles.getProfile(settings.javaFormatter.activeProfile);
                if (!profile?.path) {
                    return;
                }
                const formatted = await this.jdt.format({
                    source: doc.getText(),
                    profilePath: profile.path,
                    profileName: profile.origin === 'builtin' ? undefined : profile.name,
                    kind: 'compilation-unit' as JdtFormatKind,
                });
                if (formatted !== doc.getText()) {
                    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
                    e.waitUntil(Promise.resolve([vscode.TextEdit.replace(fullRange, formatted)]));
                }
            } else if (doc.languageId === 'jsp' && this.isJspFormatterEnabled() && this.config.settings.jspFormatter.formatOnSave) {
                const settings = this.config.settings;
                const profile = await this.profiles.getJspProfile(settings.jspFormatter.activeProfile);
                const formatJava =
                    profile.formatScriptletJava && this.isJavaFormatterEnabled()
                        ? (source: string, kind: JavaSnippetKind) => this.formatJavaSnippet(source, kind, settings.javaFormatter.activeProfile)
                        : undefined;
                const formatted = await formatJsp(doc.getText(), { profile, formatJava });
                if (formatted !== doc.getText()) {
                    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
                    e.waitUntil(Promise.resolve([vscode.TextEdit.replace(fullRange, formatted)]));
                }
            }
        } catch (err) {
            this.reportError('Format on save failed', err);
        }
    }

    private reportError(title: string, e: unknown): void {
        const message = e instanceof Error ? e.message : String(e);
        this.output.appendLine(`[${new Date().toISOString()}] ${title}: ${message}`);
        this.output.show(true);
        vscode.window.showErrorMessage(`JavaScope: ${title}. See output for details.`);
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
