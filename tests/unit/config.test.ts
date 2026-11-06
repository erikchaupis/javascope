import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigManager } from '../../src/configuration/configManager';

describe('ConfigManager', () => {
    let root: string;
    let userDir: string;
    let wsDir: string;
    let workspaceDir: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'javascope-config-'));
        userDir = path.join(root, 'user');
        wsDir = path.join(root, 'wsroot');
        workspaceDir = path.join(wsDir, '.javascope');
        fs.mkdirSync(workspaceDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    function write(dir: string, doc: object): void {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(doc));
    }

    it('uses built-in defaults when no files exist', () => {
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir });
        const s = cm.settings;
        assert.strictEqual(s.enabled, true);
        assert.strictEqual(s.themes.active, 'eclipse-light');
        assert.strictEqual(s.javaFormatter.activeProfile, 'builtin:java:eclipse-default');
        assert.strictEqual(s.jspFormatter.formatOnSave, false);
        assert.strictEqual(cm.effective.themes.active.origin, 'default');
    });

    it('user settings override defaults and report origin "user"', () => {
        write(userDir, { themes: { active: 'intellij-darcula' } });
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir });
        assert.strictEqual(cm.settings.themes.active, 'intellij-darcula');
        assert.strictEqual(cm.effective.themes.active.origin, 'user');
    });

    it('workspace settings override user settings', () => {
        write(userDir, { themes: { active: 'intellij-darcula' }, javaFormatter: { formatOnSave: false } });
        write(workspaceDir, { themes: { active: 'eclipse-dark' } });
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir });
        assert.strictEqual(cm.settings.themes.active, 'eclipse-dark');
        assert.strictEqual(cm.effective.themes.active.origin, 'workspace');
        // untouched keys still come from the user layer
        assert.strictEqual(cm.settings.javaFormatter.formatOnSave, false);
        assert.strictEqual(cm.effective.javaFormatter.formatOnSave.origin, 'user');
    });

    it('VS Code settings layer sits below .javascope files', () => {
        write(userDir, { themes: { active: 'eclipse-dark' } });
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir });
        cm.setVscodeLayer({ themes: { active: 'intellij-light' } }, { javaFormatter: { enabled: false } });
        assert.strictEqual(cm.settings.themes.active, 'eclipse-dark'); // user file wins
        assert.strictEqual(cm.effective.themes.active.origin, 'user');
        assert.strictEqual(cm.settings.javaFormatter.enabled, false); // vscode workspace layer applies
        assert.strictEqual(cm.effective.javaFormatter.enabled.origin, 'vscode-workspace');
    });

    it('update writes only to the resolved target location', () => {
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir });
        const result = cm.update({ javaFormatter: { formatOnSave: true } });
        assert.strictEqual(result.target, 'workspace'); // auto -> workspace when folder exists
        assert.ok(fs.existsSync(path.join(workspaceDir, 'settings.json')));
        assert.ok(!fs.existsSync(path.join(userDir, 'settings.json')));
        const persisted = JSON.parse(fs.readFileSync(path.join(workspaceDir, 'settings.json'), 'utf8'));
        assert.strictEqual(persisted.javaFormatter.formatOnSave, true);
    });

    it('update with location "user" writes to the user config only', () => {
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir });
        cm.update({ themes: { enabled: false } }, 'user');
        const persisted = JSON.parse(fs.readFileSync(path.join(userDir, 'settings.json'), 'utf8'));
        assert.strictEqual(persisted.themes.enabled, false);
        assert.ok(!fs.existsSync(path.join(workspaceDir, 'settings.json')));
    });

    it('resolveTarget honors explicit configurationLocation', () => {
        write(userDir, { configurationLocation: 'user' });
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir });
        assert.strictEqual(cm.resolveTarget(), 'user');
    });

    it('resolveTarget falls back to user when no workspace is open', () => {
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: null });
        assert.strictEqual(cm.resolveTarget(), 'user');
        const cm2 = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: null });
        assert.throws(() => cm2.resolveTarget('workspace'), /no workspace folder/);
    });

    it('detects invalid JSON and schema violations as problems', () => {
        fs.mkdirSync(userDir, { recursive: true });
        fs.writeFileSync(path.join(userDir, 'settings.json'), '{ not json');
        write(workspaceDir, { javaFormatter: { enabled: 'yes' } });
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir });
        const problems = cm.problems;
        assert.strictEqual(problems.length, 2);
        assert.ok(problems[0].problems[0].includes('invalid JSON'));
        assert.ok(problems[1].problems[0].includes('must be a boolean'));
    });

    it('ignores unknown keys in settings.json', () => {
        write(userDir, { somethingFuture: { x: 1 }, enabled: true });
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir });
        assert.strictEqual(cm.problems.length, 0);
        assert.strictEqual(cm.settings.enabled, true);
    });

    it('reload picks up manual file changes (discovery)', () => {
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir });
        assert.strictEqual(cm.settings.themes.active, 'eclipse-light');
        write(workspaceDir, { themes: { active: 'eclipse-dark' } });
        cm.reload();
        assert.strictEqual(cm.settings.themes.active, 'eclipse-dark');
    });

    it('update merges with existing file content', () => {
        write(workspaceDir, { themes: { active: 'eclipse-dark' } });
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir });
        cm.update({ jspFormatter: { formatOnSave: true } });
        cm.reload();
        assert.strictEqual(cm.settings.themes.active, 'eclipse-dark');
        assert.strictEqual(cm.settings.jspFormatter.formatOnSave, true);
    });

    it('emits change events from reload', (done) => {
        const cm = new ConfigManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir });
        cm.on('change', () => done());
        cm.reload();
    });
});
