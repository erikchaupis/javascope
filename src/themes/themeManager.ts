import * as vscode from 'vscode';
import { JavaScopeTheme } from './builtinThemes';
import { resolveThemeRules } from './customThemes';

/**
 * Marker stamped on every settings entry JavaScope writes. VS Code ignores
 * unknown keys inside token color rules, so the marker persists in
 * settings.json and lets cleanup find our entries unambiguously — no deep
 * equality against a remembered block, so stale entries can never survive an
 * extension host reload.
 */
const RULE_MARKER = 'javascope';

type MarkedTextMateRule = Record<string, unknown> & { [RULE_MARKER]: true };
type MarkedSemanticBlock = Record<string, unknown> & { [RULE_MARKER]: true };

function isMarked(value: unknown): boolean {
    return typeof value === 'object' && value !== null && (value as Record<string, unknown>)[RULE_MARKER] === true;
}

/**
 * Applies and removes JavaScope editor color customization through the
 * supported VS Code APIs (`editor.tokenColorCustomizations` and
 * `editor.semanticTokenColorCustomizations`).
 *
 * Reversibility: applied entries carry a `javascope` marker; removal filters
 * exactly those entries out of the current configuration, leaving unrelated
 * user settings untouched. Applying first strips any previously applied
 * entries, so repeated applies are idempotent.
 *
 * Semantic rules are scoped to the active workbench theme
 * (`"[Theme Name]": { rules: ... }`) so they follow the user's UI theme
 * without affecting other languages.
 */
export class ThemeManager implements vscode.Disposable {
    private applied = false;
    private activeTheme: JavaScopeTheme | null = null;
    private enabled = false;
    private jspTemplates = false;
    private queue: Promise<void> = Promise.resolve();
    private readonly disposables: vscode.Disposable[] = [];
    private readonly output = vscode.window.createOutputChannel('JavaScope');

    constructor() {
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('workbench.colorTheme') && this.enabled && this.activeTheme) {
                    // Re-scope semantic rules to the new workbench theme.
                    this.log('workbench theme changed; re-scoping semantic rules');
                    void this.applyTheme(this.activeTheme, true, this.jspTemplates);
                } else if (
                    this.enabled &&
                    this.applied &&
                    this.activeTheme &&
                    (e.affectsConfiguration('editor.tokenColorCustomizations') ||
                        e.affectsConfiguration('editor.semanticTokenColorCustomizations'))
                ) {
                    // Something outside JavaScope touched the color settings
                    // (Settings Sync, manual edits, another extension). If our
                    // entries vanished, re-assert them.
                    void this.assertStillApplied();
                }
            }),
        );
    }

    private log(message: string): void {
        this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
    }

    /** Re-applies the active theme if our marked entries were removed externally. */
    private async assertStillApplied(): Promise<void> {
        await this.enqueue(async () => {
            if (!this.applied || !this.activeTheme) {
                return;
            }
            const editorConfig = vscode.workspace.getConfiguration('editor');
            const tm = (editorConfig.get('tokenColorCustomizations') ?? {}) as Record<string, unknown>;
            const rules = Array.isArray(tm.textMateRules) ? (tm.textMateRules as Array<Record<string, unknown>>) : [];
            const hasTextMate = rules.some((rule) => isMarked(rule));
            const sem = (editorConfig.get('semanticTokenColorCustomizations') ?? {}) as Record<string, unknown>;
            const hasSemantic = Object.values(sem).some((value) => isMarked(value));
            if (!hasTextMate || !hasSemantic) {
                this.log(`entries missing externally (textMate=${hasTextMate}, semantic=${hasSemantic}); re-applying '${this.activeTheme.id}'`);
                await this.doApplyTheme(this.activeTheme, true, this.jspTemplates);
            }
        });
    }

    get currentThemeId(): string | null {
        return this.activeTheme?.id ?? null;
    }

    /** Serializes theme mutations so concurrent refreshes cannot interleave. */
    private enqueue(task: () => Promise<void>): Promise<void> {
        const next = this.queue.then(task, task);
        this.queue = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }

    /**
     * Applies a theme. `jspTemplates` additionally paints the HTML template
     * parts (tags, attributes, EL) inside .jsp files with the scheme's HTML
     * palette; it is remembered so workbench-theme re-scoping keeps it.
     */
    async applyTheme(theme: JavaScopeTheme, reapply = false, jspTemplates = false): Promise<void> {
        await this.enqueue(() => this.doApplyTheme(theme, reapply, jspTemplates));
    }

    async removeCustomization(clearActive = true): Promise<void> {
        await this.enqueue(() => this.doRemoveCustomization(clearActive));
    }

    private async doApplyTheme(theme: JavaScopeTheme, reapply: boolean, jspTemplates: boolean): Promise<void> {
        if (this.applied && !reapply) {
            await this.doRemoveCustomization(false);
        }
        const { textMateRules, semanticRules } = resolveThemeRules(theme, { jspTemplates });
        const editorConfig = vscode.workspace.getConfiguration('editor');

        const currentTm = (editorConfig.get('tokenColorCustomizations') ?? {}) as Record<string, unknown>;
        const existingRules = Array.isArray(currentTm.textMateRules)
            ? (currentTm.textMateRules as Array<Record<string, unknown>>)
            : [];
        const marked = textMateRules.map((rule) => ({ ...rule, [RULE_MARKER]: true }) as MarkedTextMateRule);
        const newTm: Record<string, unknown> = {
            ...currentTm,
            textMateRules: [...existingRules.filter((rule) => !isMarked(rule)), ...marked],
        };
        await editorConfig.update('tokenColorCustomizations', newTm, vscode.ConfigurationTarget.Global);

        const themeKey = this.workbenchThemeKey();
        const currentSem = (editorConfig.get('semanticTokenColorCustomizations') ?? {}) as Record<string, unknown>;
        const newSemantic: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(currentSem)) {
            if (!isMarked(value)) {
                newSemantic[key] = value;
            }
        }
        newSemantic[themeKey] = { rules: semanticRules, [RULE_MARKER]: true } as MarkedSemanticBlock;
        await editorConfig.update('semanticTokenColorCustomizations', newSemantic, vscode.ConfigurationTarget.Global);

        this.applied = true;
        this.activeTheme = theme;
        this.enabled = true;
        this.jspTemplates = jspTemplates;
        this.log(
            `applied theme '${theme.id}' (${marked.length} textMate rules, semantic key '${themeKey}', jspTemplates=${jspTemplates})`,
        );
    }

    private async doRemoveCustomization(clearActive: boolean): Promise<void> {
        const editorConfig = vscode.workspace.getConfiguration('editor');

        const currentTm = (editorConfig.get('tokenColorCustomizations') ?? {}) as Record<string, unknown>;
        const existingRules = Array.isArray(currentTm.textMateRules)
            ? (currentTm.textMateRules as Array<Record<string, unknown>>)
            : [];
        const remaining = existingRules.filter((rule) => !isMarked(rule));
        if (remaining.length !== existingRules.length) {
            const newTm: Record<string, unknown> = { ...currentTm };
            if (remaining.length > 0) {
                newTm.textMateRules = remaining;
            } else {
                delete newTm.textMateRules;
            }
            await editorConfig.update('tokenColorCustomizations', newTm, vscode.ConfigurationTarget.Global);
        }

        const currentSem = (editorConfig.get('semanticTokenColorCustomizations') ?? {}) as Record<string, unknown>;
        const semEntries = Object.entries(currentSem);
        if (semEntries.some(([, value]) => isMarked(value))) {
            const newSem: Record<string, unknown> = {};
            for (const [key, value] of semEntries) {
                if (!isMarked(value)) {
                    newSem[key] = value;
                }
            }
            await editorConfig.update('semanticTokenColorCustomizations', newSem, vscode.ConfigurationTarget.Global);
        }

        this.applied = false;
        if (clearActive) {
            this.activeTheme = null;
            this.enabled = false;
            this.jspTemplates = false;
            this.log('customization removed');
        }
    }

    private workbenchThemeKey(): string {
        const theme = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme');
        return theme ? `[${theme}]` : '[Default Dark Modern]';
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.output.dispose();
    }
}
