import * as assert from 'assert';
import { mergeSettings, validateSettingsFile } from '../../src/configuration/schema';

describe('settings schema', () => {
    it('reports origin per layer', () => {
        const e = mergeSettings({
            vscodeUser: { themes: { active: 'intellij-light' } },
            userSettings: { themes: { active: 'eclipse-dark' } },
            workspaceSettings: { themes: { active: 'intellij-darcula' } },
        });
        assert.strictEqual(e.themes.active.value, 'intellij-darcula');
        assert.strictEqual(e.themes.active.origin, 'workspace');

        const e2 = mergeSettings({
            vscodeUser: { themes: { active: 'intellij-light' } },
            userSettings: { themes: { active: 'eclipse-dark' } },
        });
        assert.strictEqual(e2.themes.active.origin, 'user');

        const e3 = mergeSettings({ vscodeUser: { themes: { active: 'intellij-light' } } });
        assert.strictEqual(e3.themes.active.origin, 'vscode-user');

        const e4 = mergeSettings({});
        assert.strictEqual(e4.themes.active.origin, 'default');
    });

    it('empty strings fall through to lower layers', () => {
        const e = mergeSettings({
            vscodeUser: { themes: { active: 'intellij-light' } },
            workspaceSettings: { themes: { active: '' } },
        });
        assert.strictEqual(e.themes.active.value, 'intellij-light');
    });

    it('workspace beats vscode-workspace for booleans', () => {
        const e = mergeSettings({
            vscodeWorkspace: { javaFormatter: { formatOnSave: true } },
            workspaceSettings: { javaFormatter: { formatOnSave: false } },
        });
        assert.strictEqual(e.javaFormatter.formatOnSave.value, false);
        assert.strictEqual(e.javaFormatter.formatOnSave.origin, 'workspace');
    });

    it('validates settings file shapes', () => {
        assert.deepStrictEqual(validateSettingsFile(null), ['settings.json must contain a JSON object']);
        assert.deepStrictEqual(validateSettingsFile([]), ['settings.json must contain a JSON object']);
        assert.deepStrictEqual(validateSettingsFile({}), []);
        assert.deepStrictEqual(validateSettingsFile({ enabled: true }), []);
        assert.ok(validateSettingsFile({ enabled: 'yes' })[0].includes('"enabled" must be a boolean'));
        assert.ok(validateSettingsFile({ configurationLocation: 'moon' })[0].includes('configurationLocation'));
        assert.ok(validateSettingsFile({ javaFormatter: { formatOnSave: 1 } })[0].includes('formatOnSave'));
        assert.ok(validateSettingsFile({ jspFormatter: 'x' })[0].includes('must be an object'));
        assert.ok(validateSettingsFile({ themes: { active: 3 } })[0].includes('themes.active'));
        assert.deepStrictEqual(validateSettingsFile({ themes: { jspTemplates: { enabled: true } } }), []);
        assert.ok(
            validateSettingsFile({ themes: { jspTemplates: { enabled: 'yes' } } })[0].includes(
                'themes.jspTemplates.enabled',
            ),
        );
        assert.ok(validateSettingsFile({ themes: { jspTemplates: 'x' } })[0].includes('themes.jspTemplates'));
    });

    it('jspTemplates defaults to off and merges across layers', () => {
        const e = mergeSettings({});
        assert.strictEqual(e.themes.jspTemplates.value, false);
        assert.strictEqual(e.themes.jspTemplates.origin, 'default');

        const on = mergeSettings({ workspaceSettings: { themes: { jspTemplates: { enabled: true } } } });
        assert.strictEqual(on.themes.jspTemplates.value, true);
        assert.strictEqual(on.themes.jspTemplates.origin, 'workspace');

        // A workspace that does not mention it must not reset a user-level on.
        const inherited = mergeSettings({
            userSettings: { themes: { jspTemplates: { enabled: true } } },
            workspaceSettings: { themes: { active: 'eclipse-dark' } },
        });
        assert.strictEqual(inherited.themes.jspTemplates.value, true);
        assert.strictEqual(inherited.themes.jspTemplates.origin, 'user');
    });
});
