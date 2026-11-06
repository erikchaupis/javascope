import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProfileManager } from '../../src/formatter/profileManager';
import { BUILTIN_JSP_PROFILE } from '../../src/formatter/jsp/profile';

const BUILTIN_JAVA_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<profiles version="21">
<profile kind="CodeFormatterProfile" name="Eclipse [built-in]" version="21">
<setting id="org.eclipse.jdt.core.formatter.tabulation.size" value="4"/>
</profile>
</profiles>
`;

describe('ProfileManager', () => {
    let root: string;
    let userDir: string;
    let workspaceDir: string;
    let builtinXml: string;
    let pm: ProfileManager;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'javascope-profiles-'));
        userDir = path.join(root, 'user');
        workspaceDir = path.join(root, 'ws', '.javascope');
        fs.mkdirSync(workspaceDir, { recursive: true });
        builtinXml = path.join(root, 'default.xml');
        fs.writeFileSync(builtinXml, BUILTIN_JAVA_XML);
        pm = new ProfileManager({ userConfigDir: userDir, workspaceConfigDir: workspaceDir, builtinJavaProfilePath: builtinXml });
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('lists built-in profiles for both kinds', () => {
        const java = pm.listProfiles('java');
        assert.ok(java.some((p) => p.id === 'builtin:java:eclipse-default' && p.origin === 'builtin'));
        const jsp = pm.listProfiles('jsp');
        assert.ok(jsp.some((p) => p.id === 'builtin:jsp:default' && p.origin === 'builtin'));
    });

    it('discovers user and workspace profiles with origins', async () => {
        fs.mkdirSync(path.join(userDir, 'formatters', 'java'), { recursive: true });
        fs.writeFileSync(path.join(userDir, 'formatters', 'java', 'company.xml'), BUILTIN_JAVA_XML);
        fs.mkdirSync(path.join(workspaceDir, 'formatters', 'jsp'), { recursive: true });
        fs.writeFileSync(path.join(workspaceDir, 'formatters', 'jsp', 'team.json'), JSON.stringify({ name: 'Team JSP' }));

        const java = pm.listProfiles('java');
        assert.ok(java.some((p) => p.origin === 'user' && p.name === 'company'));
        const jsp = pm.listProfiles('jsp');
        assert.ok(jsp.some((p) => p.origin === 'workspace' && p.name === 'team'));
    });

    it('workspace profile overrides user profile with the same name', () => {
        fs.mkdirSync(path.join(userDir, 'formatters', 'jsp'), { recursive: true });
        fs.writeFileSync(path.join(userDir, 'formatters', 'jsp', 'shared.json'), JSON.stringify({ name: 'user version' }));
        fs.mkdirSync(path.join(workspaceDir, 'formatters', 'jsp'), { recursive: true });
        fs.writeFileSync(path.join(workspaceDir, 'formatters', 'jsp', 'shared.json'), JSON.stringify({ name: 'workspace version' }));

        const jsp = pm.listProfiles('jsp');
        const shared = jsp.filter((p) => p.name === 'shared');
        assert.strictEqual(shared.length, 1);
        assert.strictEqual(shared[0].origin, 'workspace');
    });

    it('creates a JSP profile from defaults', async () => {
        const id = await pm.createProfile({ kind: 'jsp', name: 'my-style', origin: 'user' });
        assert.strictEqual(id, 'user:jsp:my-style');
        const profile = await pm.getJspProfile(id);
        assert.strictEqual(profile.name, 'my-style');
        assert.strictEqual(profile.indentation.size, BUILTIN_JSP_PROFILE.indentation.size);
    });

    it('creates a Java profile duplicating the built-in default', async () => {
        const id = await pm.createProfile({ kind: 'java', name: 'company-style', origin: 'workspace' });
        const content = (await pm.getProfileContent(id)).content as { settings: Map<string, string>; profileName: string };
        assert.strictEqual(content.profileName, 'company-style');
        assert.strictEqual(content.settings.get('org.eclipse.jdt.core.formatter.tabulation.size'), '4');
    });

    it('duplicates an existing profile with new name', async () => {
        const id = await pm.createProfile({ kind: 'jsp', name: 'base', origin: 'user' });
        const copy = await pm.createProfile({ kind: 'jsp', name: 'base-copy', origin: 'user', duplicateFrom: id });
        const profile = await pm.getJspProfile(copy);
        assert.strictEqual(profile.name, 'base-copy');
    });

    it('renames a profile file and its embedded name', async () => {
        const id = await pm.createProfile({ kind: 'java', name: 'before', origin: 'user' });
        const newId = await pm.renameProfile(id, 'after');
        assert.strictEqual(newId, 'user:java:after');
        assert.strictEqual(pm.getProfile(id), null);
        const content = (await pm.getProfileContent(newId)).content as { profileName: string };
        assert.strictEqual(content.profileName, 'after');
    });

    it('deletes custom profiles but protects built-ins', async () => {
        const id = await pm.createProfile({ kind: 'jsp', name: 'temp', origin: 'user' });
        pm.deleteProfile(id);
        assert.strictEqual(pm.getProfile(id), null);
        assert.throws(() => pm.deleteProfile('builtin:jsp:default'), /read-only/);
    });

    it('imports and exports profiles', async () => {
        const src = path.join(root, 'imported.xml');
        fs.writeFileSync(src, BUILTIN_JAVA_XML);
        const id = await pm.importProfile({ kind: 'java', sourcePath: src, origin: 'user' });
        assert.strictEqual(id, 'user:java:imported');

        const dest = path.join(root, 'exported.xml');
        await pm.exportProfile(id, dest);
        assert.ok(fs.existsSync(dest));
        await assert.rejects(
            () => pm.getProfileContent('user:java:missing'),
            /profile not found/,
        );
    });

    it('rejects invalid XML with a clear error', async () => {
        fs.mkdirSync(path.join(userDir, 'formatters', 'java'), { recursive: true });
        const bad = path.join(userDir, 'formatters', 'java', 'broken.xml');
        fs.writeFileSync(bad, '<profiles><profile></profiles>');
        await assert.rejects(() => pm.getProfileContent('user:java:broken'), /invalid XML/);
    });

    it('rejects non-profile XML', async () => {
        const src = path.join(root, 'notaprofile.xml');
        fs.writeFileSync(src, '<something><else/></something>');
        await assert.rejects(() => pm.importProfile({ kind: 'java', sourcePath: src, origin: 'user' }), /no <profile>/);
    });

    it('rejects invalid JSP JSON', async () => {
        const src = path.join(root, 'bad.json');
        fs.writeFileSync(src, JSON.stringify({ indentation: { style: 'banana' } }));
        await assert.rejects(
            () => pm.importProfile({ kind: 'jsp', sourcePath: src, origin: 'user' }),
            /indentation\.style/,
        );
    });

    it('rejects importing a profile with a duplicate name', async () => {
        const src = path.join(root, 'dup.json');
        fs.writeFileSync(src, JSON.stringify({ name: 'x' }));
        await pm.importProfile({ kind: 'jsp', sourcePath: src, origin: 'user' });
        await assert.rejects(() => pm.importProfile({ kind: 'jsp', sourcePath: src, origin: 'user' }), /already exists/);
    });

    it('validates content before updating a profile', async () => {
        const id = await pm.createProfile({ kind: 'jsp', name: 'editable', origin: 'user' });
        await assert.rejects(
            () => pm.updateProfileContent(id, { lineWidth: 'wide' }),
            /lineWidth/,
        );
        await pm.updateProfileContent(id, { name: 'editable', lineWidth: 100 });
        assert.strictEqual((await pm.getJspProfile(id)).lineWidth, 100);
    });

    it('returns the built-in JSP profile content', async () => {
        const content = (await pm.getProfileContent('builtin:jsp:default')).content;
        assert.strictEqual((content as { id: string }).id, 'builtin:jsp:default');
    });

    it('loads the built-in JSP profile from disk when provided', async () => {
        const jspDefault = path.join(root, 'jsp-default.json');
        fs.writeFileSync(jspDefault, JSON.stringify({ name: 'File Default', lineWidth: 99 }));
        const pm2 = new ProfileManager({
            userConfigDir: userDir,
            workspaceConfigDir: workspaceDir,
            builtinJavaProfilePath: builtinXml,
            builtinJspProfilePath: jspDefault,
        });
        const content = (await pm2.getProfileContent('builtin:jsp:default')).content as { name: string; lineWidth: number };
        assert.strictEqual(content.name, 'File Default');
        assert.strictEqual(content.lineWidth, 99);
        assert.strictEqual(pm2.listProfiles('jsp').find((p) => p.origin === 'builtin')?.name, 'File Default');
    });
});
