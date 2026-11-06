import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { JdtFormatterService } from '../../src/formatter/jdtService';

const JAR = path.join(__dirname, '..', '..', 'formatters', 'java', 'bin', 'javascope-jdt-formatter.jar');
const DEFAULT_PROFILE = path.join(__dirname, '..', '..', 'formatters', 'java', 'default.xml');

async function javaAvailable(): Promise<boolean> {
    try {
        const { execFile } = await import('child_process');
        return await new Promise((resolve) => {
            execFile('java', ['-version'], (err) => resolve(!err));
        });
    } catch {
        return false;
    }
}

describe('JdtFormatterService (Eclipse JDT CLI)', function () {
    this.timeout(90000);
    const service = new JdtFormatterService();
    let hasJava = false;

    before(async () => {
        hasJava = fs.existsSync(JAR) && (await javaAvailable());
    });

    const needsJava = (): boolean => {
        if (!hasJava) {
            console.log('SKIP: Java runtime or formatter JAR not available');
        }
        return hasJava;
    };

    it('bundled JAR exists', () => {
        assert.ok(fs.existsSync(JAR), 'javascope-jdt-formatter.jar must be bundled');
        assert.ok(fs.existsSync(DEFAULT_PROFILE), 'default.xml must be bundled');
    });

    it('default-constructed service locates the bundled JAR', () => {
        // Regression: the default path must resolve from the source tree
        // (ts-node) AND from the bundled out/ layout inside the extension.
        const defaultService = new JdtFormatterService();
        assert.ok(defaultService.isJarPresent(), `default JAR path not found: ${(defaultService as unknown as { jarPath: string }).jarPath}`);
    });

    it('formats a Java compilation unit with Eclipse defaults', async () => {
        if (!needsJava()) {
            return;
        }
        const source = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'java', 'HelloUnformatted.java'), 'utf8');
        const out = await service.format({ source, profilePath: DEFAULT_PROFILE, kind: 'compilation-unit' });
        // Eclipse default: K&R braces, tabs
        assert.ok(out.includes('public class HelloUnformatted {'));
        assert.ok(out.includes('\tprivate List<String> names = new ArrayList<>();'));
        assert.ok(out.includes('\t\t\tSystem.out.println(a);'));
    });

    it('is idempotent', async () => {
        if (!needsJava()) {
            return;
        }
        const source = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'java', 'HelloUnformatted.java'), 'utf8');
        const once = await service.format({ source, profilePath: DEFAULT_PROFILE, kind: 'compilation-unit' });
        const twice = await service.format({ source: once, profilePath: DEFAULT_PROFILE, kind: 'compilation-unit' });
        assert.strictEqual(once, twice);
    });

    it('formats statement snippets (for JSP scriptlets)', async () => {
        if (!needsJava()) {
            return;
        }
        const out = await service.format({
            source: 'String s="x";\nint y=1;',
            profilePath: DEFAULT_PROFILE,
            kind: 'statements',
        });
        assert.strictEqual(out.replace(/\r\n/g, '\n').trim(), 'String s = "x";\nint y = 1;');
    });

    it('formats expressions (for JSP expressions)', async () => {
        if (!needsJava()) {
            return;
        }
        const out = await service.format({ source: 'a+b*2', profilePath: DEFAULT_PROFILE, kind: 'expression' });
        assert.strictEqual(out.trim(), 'a + b * 2');
    });

    it('formats class body declarations (for JSP declarations)', async () => {
        if (!needsJava()) {
            return;
        }
        const out = await service.format({
            source: 'private int x=1;',
            profilePath: DEFAULT_PROFILE,
            kind: 'class-body',
        });
        assert.strictEqual(out.trim(), 'private int x = 1;');
    });

    it('honors a custom profile (spaces, 4 indent, BSD braces)', async () => {
        if (!needsJava()) {
            return;
        }
        const profile = path.join(__dirname, '..', 'fixtures', 'java', 'spaces-profile.xml');
        fs.writeFileSync(
            profile,
            `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<profiles version="21">
<profile kind="CodeFormatterProfile" name="spaces" version="21">
<setting id="org.eclipse.jdt.core.formatter.tabulation.size" value="4"/>
<setting id="org.eclipse.jdt.core.formatter.tabulation.char" value="space"/>
<setting id="org.eclipse.jdt.core.formatter.brace_position_for_type_declaration" value="next_line"/>
</profile>
</profiles>
`,
        );
        try {
            const out = await service.format({
                source: 'public class A{void m(){}}',
                profilePath: profile,
                kind: 'compilation-unit',
            });
            assert.ok(out.includes('public class A\n{'));
            assert.ok(out.includes('    void m()'));
            assert.ok(!out.includes('\t'));
        } finally {
            fs.unlinkSync(profile);
        }
    });

    it('selects a named profile from a multi-profile file', async () => {
        if (!needsJava()) {
            return;
        }
        const profile = path.join(__dirname, '..', 'fixtures', 'java', 'multi-profile.xml');
        fs.writeFileSync(
            profile,
            `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<profiles version="21">
<profile kind="CodeFormatterProfile" name="tabs" version="21">
<setting id="org.eclipse.jdt.core.formatter.tabulation.char" value="tab"/>
</profile>
<profile kind="CodeFormatterProfile" name="spaces" version="21">
<setting id="org.eclipse.jdt.core.formatter.tabulation.char" value="space"/>
<setting id="org.eclipse.jdt.core.formatter.tabulation.size" value="2"/>
</profile>
</profiles>
`,
        );
        try {
            const out = await service.format({
                source: 'class A{void m(){\nint x=1;\n}}',
                profilePath: profile,
                profileName: 'spaces',
                kind: 'compilation-unit',
            });
            assert.ok(out.includes('  int x = 1;'));
        } finally {
            fs.unlinkSync(profile);
        }
    });

    it('reports a clear error for a missing profile', async () => {
        if (!needsJava()) {
            return;
        }
        await assert.rejects(
            () => service.format({ source: 'class A{}', profilePath: '/no/such/file.xml', kind: 'compilation-unit' }),
            /not found/,
        );
    });
});
