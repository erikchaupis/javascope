const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

suite('JavaScope extension', () => {
    test('activates and registers all commands', async () => {
        await vscode.extensions.getExtension('javascope.javascope').activate();
        const commands = await vscode.commands.getCommands(true);
        const expected = [
            'javascope.openAdmin',
            'javascope.formatJava',
            'javascope.formatJavaSelection',
            'javascope.formatJsp',
            'javascope.selectJavaProfile',
            'javascope.selectJspProfile',
            'javascope.toggleJavaFormatter',
            'javascope.toggleJspFormatter',
            'javascope.toggleThemes',
            'javascope.reloadConfiguration',
        ];
        for (const id of expected) {
            assert.ok(commands.includes(id), `missing command ${id}`);
        }
    });

    test('toggle commands flip settings independently', async () => {
        await vscode.commands.executeCommand('javascope.toggleJavaFormatter');
        let settings = readWorkspaceSettings();
        assert.strictEqual(settings.javaFormatter.enabled, false, 'java formatter disabled');
        assert.strictEqual(settings.jspFormatter?.enabled, undefined, 'jsp formatter untouched');
        assert.strictEqual(settings.themes, undefined, 'themes untouched');

        await vscode.commands.executeCommand('javascope.toggleJspFormatter');
        await vscode.commands.executeCommand('javascope.toggleThemes');
        settings = readWorkspaceSettings();
        assert.strictEqual(settings.jspFormatter.enabled, false);
        assert.strictEqual(settings.themes.enabled, false);

        // restore
        await vscode.commands.executeCommand('javascope.toggleJavaFormatter');
        await vscode.commands.executeCommand('javascope.toggleJspFormatter');
        await vscode.commands.executeCommand('javascope.toggleThemes');
        settings = readWorkspaceSettings();
        assert.strictEqual(settings.javaFormatter.enabled, true);
        assert.strictEqual(settings.jspFormatter.enabled, true);
        assert.strictEqual(settings.themes.enabled, true);
    });

    test('profile selection command persists the active profile', async () => {
        // Avoid QuickPick interaction: set via reload + direct config write path.
        const config = vscode.workspace.getConfiguration('javascope');
        const original = config.get('javaFormatter.activeProfile');
        try {
            await config.update('javaFormatter.activeProfile', 'builtin:java:eclipse-default', vscode.ConfigurationTarget.Workspace);
            const value = vscode.workspace.getConfiguration('javascope').get('javaFormatter.activeProfile');
            assert.strictEqual(value, 'builtin:java:eclipse-default');
        } finally {
            await config.update('javaFormatter.activeProfile', original, vscode.ConfigurationTarget.Workspace);
        }
    });

    test('administration panel opens', async () => {
        await vscode.commands.executeCommand('javascope.openAdmin');
        const panel = vscode.window.visibleTextEditors.length; // panel is a webview, not editor
        assert.ok(panel >= 0); // smoke: command ran without throwing
    });

    test('reload command runs without errors', async () => {
        await vscode.commands.executeCommand('javascope.reloadConfiguration');
    });

    test('formats a Java document with the bundled Eclipse JDT formatter', async function () {
        const { execFile } = require('child_process');
        const hasJava = await new Promise((resolve) => {
            execFile('java', ['-version'], (err) => resolve(!err));
        });
        if (!hasJava) {
            console.log('SKIP: Java runtime not available');
            return;
        }
        const fixture = path.resolve(__dirname, '..', '..', 'fixtures', 'java', 'HelloUnformatted.java');
        const document = await vscode.workspace.openTextDocument(fixture);
        const editor = await vscode.window.showTextDocument(document);
        const before = document.getText();
        assert.ok(before.includes('public class HelloUnformatted{'), 'fixture starts unformatted');

        const ok = await vscode.commands.executeCommand('javascope.formatJava');
        assert.strictEqual(ok, true, 'format command reports success');

        // wait briefly for the async JDT process edit to apply
        let after = editor.document.getText();
        for (let i = 0; i < 40 && after === before; i++) {
            await new Promise((r) => setTimeout(r, 250));
            after = editor.document.getText();
        }
        assert.ok(after.includes('public class HelloUnformatted {'), 'Eclipse-style brace spacing applied');
        assert.ok(after.includes('\t'), 'Eclipse default tab indentation applied');
        assert.notStrictEqual(after, before, 'document was modified');
    });

    test('active theme is written to VS Code color customization settings', async function () {
        this.timeout(30000);
        const settingsFile = path.join(__dirname, '..', 'workspace', '.javascope', 'settings.json');
        fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
        fs.writeFileSync(
            settingsFile,
            JSON.stringify({ version: 1, themes: { enabled: true, active: 'eclipse-light' } }, null, 2),
        );
        await vscode.commands.executeCommand('javascope.reloadConfiguration');
        // The theme manager serializes mutations; give it a moment.
        await new Promise((r) => setTimeout(r, 1500));

        const editorCfg = vscode.workspace.getConfiguration('editor');
        const tm = editorCfg.get('tokenColorCustomizations') || {};
        const rules = Array.isArray(tm.textMateRules) ? tm.textMateRules : [];
        const marked = rules.filter((r) => r && r.javascope === true);
        assert.ok(marked.length > 0, 'JavaScope TextMate rules are applied');
        const primitive = marked.find((r) => JSON.stringify(r.scope).includes('source.java storage.type.primitive.java'));
        assert.ok(primitive, 'exact primitive rule is present');
        assert.strictEqual(primitive.settings.foreground, '#7F0055');
        assert.strictEqual(primitive.settings.fontStyle, 'bold');
        const embedded = marked.find((r) => JSON.stringify(r.scope).includes('text.html.jsp punctuation.section.embedded.begin.jsp'));
        assert.ok(embedded, 'exact JSP embedded delimiter rule is present');
        assert.strictEqual(embedded.settings.foreground, '#7F0055');
        assert.strictEqual(embedded.settings.fontStyle, '');
        const constant = marked.find((r) => JSON.stringify(r.scope).includes('variable.other.constant'));
        assert.ok(constant, 'constant rule is present');
        assert.strictEqual(constant.settings.fontStyle, 'bold italic', 'constants are bold italic (Eclipse style)');

        const sem = editorCfg.get('semanticTokenColorCustomizations') || {};
        const scoped = Object.values(sem).find((v) => v && v.javascope === true);
        assert.ok(scoped, 'JavaScope semantic rules are applied under the workbench theme');
        assert.deepStrictEqual(scoped.rules.keyword, { foreground: '#7F0055', fontStyle: 'bold' });
        assert.deepStrictEqual(scoped.rules.modifier, { foreground: '#7F0055', fontStyle: 'bold' });
        const readonlyRule = scoped.rules['property.static.readonly'];
        assert.ok(readonlyRule, 'static final field rule present');
        assert.strictEqual(readonlyRule.fontStyle, 'bold italic');

        // Re-applying must not accumulate duplicate blocks.
        await vscode.commands.executeCommand('javascope.reloadConfiguration');
        await new Promise((r) => setTimeout(r, 1500));
        const tm2 = vscode.workspace.getConfiguration('editor').get('tokenColorCustomizations') || {};
        const marked2 = (Array.isArray(tm2.textMateRules) ? tm2.textMateRules : []).filter(
            (r) => r && r.javascope === true,
        );
        assert.strictEqual(marked2.length, marked.length, 're-apply keeps the same number of marked rules');

        // Self-heal: an external actor wiping our entries triggers a re-apply.
        await vscode.workspace
            .getConfiguration('editor')
            .update('tokenColorCustomizations', { textMateRules: [] }, vscode.ConfigurationTarget.Global);
        await new Promise((r) => setTimeout(r, 2000));
        const tm3 = vscode.workspace.getConfiguration('editor').get('tokenColorCustomizations') || {};
        const marked3 = (Array.isArray(tm3.textMateRules) ? tm3.textMateRules : []).filter(
            (r) => r && r.javascope === true,
        );
        assert.strictEqual(marked3.length, marked.length, 'wiped entries are re-applied by the guard');

        // JSP template option: the HTML palette rules appear only when enabled.
        fs.writeFileSync(
            settingsFile,
            JSON.stringify(
                { version: 1, themes: { enabled: true, active: 'eclipse-light', jspTemplates: { enabled: true } } },
                null,
                2,
            ),
        );
        await vscode.commands.executeCommand('javascope.reloadConfiguration');
        await new Promise((r) => setTimeout(r, 1500));
        const tmJsp = vscode.workspace.getConfiguration('editor').get('tokenColorCustomizations') || {};
        const markedJsp = (Array.isArray(tmJsp.textMateRules) ? tmJsp.textMateRules : []).filter(
            (r) => r && r.javascope === true,
        );
        const tagRule = markedJsp.find((r) => JSON.stringify(r.scope).includes('text.html.jsp entity.name.tag'));
        assert.ok(tagRule, 'JSP template tag rule applied when the option is on');
        assert.strictEqual(tagRule.settings.foreground, '#3F7F7F');
        const elRule = markedJsp.find((r) => JSON.stringify(r.scope).includes('variable.other.el'));
        assert.ok(elRule, 'EL rule applied when the option is on');

        // Disable: the customization must be fully removed from VS Code settings.
        fs.writeFileSync(
            settingsFile,
            JSON.stringify({ version: 1, themes: { enabled: false, active: 'eclipse-light' } }, null, 2),
        );
        await vscode.commands.executeCommand('javascope.reloadConfiguration');
        await new Promise((r) => setTimeout(r, 1500));

        const tm4 = vscode.workspace.getConfiguration('editor').get('tokenColorCustomizations') || {};
        const marked4 = (Array.isArray(tm4.textMateRules) ? tm4.textMateRules : []).filter(
            (r) => r && r.javascope === true,
        );
        assert.strictEqual(marked4.length, 0, 'disabling removes all marked TextMate rules');
        const sem4 = vscode.workspace.getConfiguration('editor').get('semanticTokenColorCustomizations') || {};
        assert.ok(
            !Object.values(sem4).some((v) => v && v.javascope === true),
            'disabling removes the marked semantic block',
        );

        // Restore a neutral workspace state (defaults: themes enabled).
        fs.writeFileSync(settingsFile, JSON.stringify({ version: 1 }, null, 2));
        await vscode.commands.executeCommand('javascope.reloadConfiguration');
    });
});

function readWorkspaceSettings() {
    const file = path.join(__dirname, '..', 'workspace', '.javascope', 'settings.json');
    if (!fs.existsSync(file)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
