import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BUILTIN_THEMES, buildTextMateRules, getBuiltinTheme, getCounterpartThemeId } from '../../src/themes/builtinThemes';
import { discoverCustomThemes, validateCustomTheme } from '../../src/themes/customThemes';

describe('built-in themes', () => {
    it('provides all four schemes', () => {
        const ids = BUILTIN_THEMES.map((t) => t.id);
        assert.deepStrictEqual(ids, ['eclipse-light', 'eclipse-dark', 'intellij-light', 'intellij-darcula']);
        assert.deepStrictEqual(BUILTIN_THEMES.map((t) => t.type), ['light', 'dark', 'light', 'dark']);
    });

    it('scopes every rule to Java or JSP so other languages are never affected', () => {
        for (const theme of BUILTIN_THEMES) {
            const rules = buildTextMateRules(theme);
            assert.ok(rules.length > 10, `${theme.id} should produce a rich rule set`);
            for (const rule of rules) {
                const scopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
                for (const scope of scopes) {
                    // A compound selector ("source.java keyword.control") is
                    // safe when its leftmost part anchors it to a Java/JSP
                    // grammar; the relative parts after it cannot leak.
                    const anchor = scope.split(' ').filter((p) => p.length > 0)[0];
                    const ok =
                        anchor.split('.').includes('java') ||
                        anchor.split('.').includes('jsp') ||
                        anchor === 'source.java' ||
                        anchor === 'text.html.jsp';
                    assert.ok(ok, `${theme.id}: scope "${scope}" leaks outside Java/JSP`);
                }
            }
        }
    });

    it('covers the scope shapes produced by the built-in Java grammar', () => {
        // Scopes emitted by VS Code's built-in java.tmLanguage.json. The grammar
        // scopes tokens as "<category>.<sub>.java", which a suffixed selector
        // like "keyword.control.java" can never match — regressions here show up
        // as tokens falling back to the workbench theme (e.g. package/import).
        const grammarScopes = [
            'keyword.other.package.java',
            'keyword.other.import.java',
            'storage.modifier.package.java',
            'storage.modifier.import.java',
            'variable.language.wildcard.java',
            'keyword.control.java',
            'keyword.control.try.java',
            'keyword.control.catch.java',
            'keyword.control.finally.java',
            'keyword.control.throw.java',
            'keyword.control.new.java',
            'keyword.control.ternary.java',
            'keyword.module.java',
            'keyword.operator.comparison.java',
            'keyword.operator.logical.java',
            'keyword.operator.assignment.java',
            'keyword.reserved.java',
            'storage.modifier.java',
            'storage.modifier.extends.java',
            'storage.type.primitive.java',
            'storage.type.primitive.array.java',
            'storage.type.local.java',
            'storage.type.function.arrow.java',
            'storage.type.primitive.array.java',
            'storage.type.object.array.java',
            'storage.type.java',
            'storage.type.generic.java',
            'storage.type.generic.wildcard.java',
            'entity.name.type.class.java',
            'entity.name.type.interface.java',
            'entity.name.type.enum.java',
            'entity.other.inherited-class.java',
            'entity.name.type.annotation.java',
            'entity.name.function.java',
            'variable.parameter.java',
            'variable.other.field.java',
            'variable.other.constant.java',
            'constant.other.enum.java',
            'constant.other.key.java',
            'variable.language.this.java',
            'variable.language.java',
            'string.quoted.double.java',
            'string.quoted.triple.java',
            'constant.character.escape.java',
            'constant.numeric.hex.java',
            'constant.language.java',
            'comment.line.double-slash.java',
            'comment.block.documentation.javadoc.java',
            'punctuation.terminator.java',
            'punctuation.separator.java',
            'punctuation.section.block.begin.bracket.curly.java',
            'punctuation.definition.string.begin.java',
        ];

        // Minimal TextMate selector match: selector segments must be a
        // segment-wise prefix of the scope; compound selectors ("a b") chain.
        const matches = (selector: string, scopeStack: string[]): boolean => {
            const parts = selector.split(' ').filter((p) => p.length > 0);
            if (parts.length > scopeStack.length) {
                return false;
            }
            return parts.every((part, i) => {
                const want = part.split('.');
                const have = scopeStack[i].split('.');
                return want.length <= have.length && want.every((w, j) => w === have[j]);
            });
        };

        for (const theme of BUILTIN_THEMES) {
            const rules = buildTextMateRules(theme);
            for (const scope of grammarScopes) {
                const hit = rules.some((rule) => {
                    const selectors = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
                    return selectors.some((sel) => matches(sel, ['source.java', scope]));
                });
                assert.ok(hit, `${theme.id}: no rule matches "${scope}"`);
            }
        }
    });

    it('uses hex colors everywhere', () => {
        for (const theme of BUILTIN_THEMES) {
            for (const rule of buildTextMateRules(theme)) {
                if (rule.settings.foreground) {
                    assert.ok(/^#[0-9a-fA-F]{6}$/.test(rule.settings.foreground), theme.id);
                }
            }
        }
    });

    it('maps each built-in scheme to its light/dark counterpart', () => {
        assert.strictEqual(getCounterpartThemeId('eclipse-light'), 'eclipse-dark');
        assert.strictEqual(getCounterpartThemeId('eclipse-dark'), 'eclipse-light');
        assert.strictEqual(getCounterpartThemeId('intellij-light'), 'intellij-darcula');
        assert.strictEqual(getCounterpartThemeId('intellij-darcula'), 'intellij-light');
        assert.strictEqual(getCounterpartThemeId('custom:user:x'), null);
    });

    it('eclipse light matches official Eclipse semantic styles for fields and constants', () => {
        const t = getBuiltinTheme('eclipse-light');
        assert.ok(t);
        if (!t) return;
        // Official (eclipse.jdt.ui SemanticHighlightings): fields #0000C0;
        // constants (static final) bold + italic; plain static fields italic
        // only. The language server emits the readonly modifier for final
        // fields, so the distinction is exact.
        assert.strictEqual(t.semanticRules?.property, '#0000C0');
        assert.strictEqual(t.semanticRules?.['property.readonly'], '#0000C0');
        assert.deepStrictEqual(t.semanticRules?.['property.static'], { foreground: '#0000C0', fontStyle: 'italic' });
        assert.deepStrictEqual(t.semanticRules?.['property.static.readonly'], {
            foreground: '#0000C0',
            fontStyle: 'bold italic',
        });
        const rules = buildTextMateRules(t);
        const constantRule = rules.find((r) =>
            (Array.isArray(r.scope) ? r.scope : [r.scope]).some((s) => s.includes('variable.other.constant')),
        );
        assert.strictEqual(constantRule?.settings.foreground, '#0000C0');
        assert.strictEqual(constantRule?.settings.fontStyle, 'bold italic');
        // Reference types (List, String, new X(), generics) are uncolored in
        // Eclipse, never keyword-colored.
        const refTypeRule = rules.find((r) =>
            (Array.isArray(r.scope) ? r.scope : [r.scope]).some((s) => s.endsWith('storage.type.java')),
        );
        assert.strictEqual(refTypeRule?.settings.foreground, '#000000');
        assert.strictEqual(refTypeRule?.settings.fontStyle, undefined);
        assert.ok(
            (Array.isArray(refTypeRule?.scope) ? refTypeRule?.scope : [refTypeRule?.scope]).some((s) =>
                s.includes('storage.type.generic'),
            ),
        );
        // null/true/false are keywords in Eclipse: purple bold, not black.
        const constLangRule = rules.find((r) =>
            (Array.isArray(r.scope) ? r.scope : [r.scope]).includes('source.java constant.language'),
        );
        assert.strictEqual(constLangRule?.settings.foreground, '#7F0055');
        assert.strictEqual(constLangRule?.settings.fontStyle, 'bold');
        // Primitives arrive as semantic "keyword" tokens and must stay purple bold.
        assert.deepStrictEqual(t.semanticRules?.keyword, { foreground: '#7F0055', fontStyle: 'bold' });
    });

    it('gates JSP template rules behind the option and scopes them to .jsp', () => {
        const t = getBuiltinTheme('eclipse-light');
        assert.ok(t);
        if (!t) return;
        const base = buildTextMateRules(t);
        const embedded = base.find((r) =>
            (Array.isArray(r.scope) ? r.scope : [r.scope]).includes('text.html.jsp punctuation.section.embedded.begin.jsp'),
        );
        assert.strictEqual(embedded?.settings.foreground, '#7F0055');
        assert.strictEqual(embedded?.settings.fontStyle, '');
        assert.ok(
            !base.some((r) =>
                (Array.isArray(r.scope) ? r.scope : [r.scope]).some((s) => s.includes('text.html.jsp entity.name.tag.html')),
            ),
            'no JSP template rules without the option',
        );
        const withJsp = buildTextMateRules(t, { jspTemplates: true });
        const tag = withJsp.find((r) =>
            (Array.isArray(r.scope) ? r.scope : [r.scope]).some((s) => s.includes('text.html.jsp entity.name.tag.html')),
        );
        assert.ok(tag, 'tag rule present with the option');
        assert.strictEqual(tag?.settings.foreground, '#3F7F7F');
        const el = withJsp.find((r) =>
            (Array.isArray(r.scope) ? r.scope : [r.scope]).includes('text.html.jsp meta.expression.jsp'),
        );
        assert.strictEqual(el?.settings.foreground, '#000000');
        const attribute = withJsp.find((r) =>
            (Array.isArray(r.scope) ? r.scope : [r.scope]).includes('text.html.jsp entity.other.attribute-name'),
        );
        assert.strictEqual(attribute?.settings.foreground, '#800080');
        assert.strictEqual(attribute?.settings.fontStyle, 'italic');
        // Directive tag names must stay keyword-colored even with the option on.
        const directive = withJsp.find((r) =>
            (Array.isArray(r.scope) ? r.scope : [r.scope]).some((s) => s.includes('entity.name.tag.directive.jsp')),
        );
        assert.strictEqual(directive?.settings.foreground, '#7F0055');
        for (const rule of withJsp) {
            for (const sel of Array.isArray(rule.scope) ? rule.scope : [rule.scope]) {
                if (sel.includes('text.html.jsp')) {
                    assert.ok(sel.startsWith('text.html.jsp'), `JSP template selector leaks: ${sel}`);
                }
            }
        }
    });

    it('JSP grammar includes EL expressions inside HTML attribute strings', () => {
        const grammar = JSON.parse(fs.readFileSync(path.join(__dirname, '../../syntaxes/jsp.tmLanguage.json'), 'utf8'));
        const injection = grammar.injections['text.html.jsp string.quoted.double.html, text.html.jsp string.quoted.single.html'];
        assert.deepStrictEqual(injection?.patterns, [{ include: '#el-expression' }]);
        assert.ok(grammar.repository['el-expression'].patterns.some((p: { include?: string }) => p.include === '#strings'));
    });

    it('ships no JSP template palette on IntelliJ schemes (custom themes may add one)', () => {
        for (const id of ['intellij-light', 'intellij-darcula']) {
            const ij = getBuiltinTheme(id);
            assert.ok(ij);
            if (!ij) return;
            const rules = buildTextMateRules(ij, { jspTemplates: true });
            assert.ok(
                !rules.some((r) =>
                    (Array.isArray(r.scope) ? r.scope : [r.scope]).some(
                        (s) => s.startsWith('text.html.jsp ') && s.includes('entity.name.tag'),
                    ),
                ),
                `${id} must not emit JSP template rules`,
            );
            assert.strictEqual(ij.colors.htmlTag, undefined);
        }
    });

    it('eclipse light keeps semantic keywords and modifiers consistent with keyword coloring', () => {
        const t = getBuiltinTheme('eclipse-light');
        assert.deepStrictEqual(t?.semanticRules?.keyword, { foreground: '#7F0055', fontStyle: 'bold' });
        assert.deepStrictEqual(t?.semanticRules?.modifier, { foreground: '#7F0055', fontStyle: 'bold' });
        const rules = buildTextMateRules(t!);
        const keywordRule = rules.find((r) =>
            (Array.isArray(r.scope) ? r.scope : [r.scope]).includes('source.java storage.type.primitive.java'),
        );
        assert.strictEqual(keywordRule?.settings.foreground, '#7F0055');
        assert.strictEqual(keywordRule?.settings.fontStyle, 'bold');
    });

    it('eclipse light colors comment delimiters like the comment text', () => {
        const t = getBuiltinTheme('eclipse-light');
        assert.ok(t);
        if (!t) return;
        const rules = buildTextMateRules(t);
        const allScopes = rules
            .filter((r) => (Array.isArray(r.scope) ? r.scope : [r.scope]).some((s) => s.includes('punctuation.definition.comment')))
            .flatMap((r) => (Array.isArray(r.scope) ? r.scope : [r.scope]));
        assert.ok(allScopes.some((s) => s.includes('comment.line punctuation.definition.comment')));
        assert.ok(allScopes.some((s) => s.includes('comment.block punctuation.definition.comment')));
        assert.ok(allScopes.some((s) => s.includes('comment.block.documentation punctuation.definition.comment')));
        const javadocDelim = rules.find((r) =>
            (Array.isArray(r.scope) ? r.scope : [r.scope]).some((s) => s.includes('comment.block.documentation punctuation')),
        );
        assert.strictEqual(javadocDelim?.settings.foreground, '#3F5FBF');
    });

    it('disambiguates field declarations from local declarations by context', () => {
        const t = getBuiltinTheme('eclipse-light');
        assert.ok(t);
        if (!t) return;
        const rules = buildTextMateRules(t);
        const fieldIdx = rules.findIndex((r) =>
            (Array.isArray(r.scope) ? r.scope : [r.scope]).some((s) =>
                s.includes('meta.class meta.definition.variable variable.other.definition'),
            ),
        );
        const localIdx = rules.findIndex((r) =>
            (Array.isArray(r.scope) ? r.scope : [r.scope]).some((s) =>
                s.includes('meta.method meta.definition.variable variable.other.definition'),
            ),
        );
        assert.ok(fieldIdx >= 0, 'field-declaration rule present');
        assert.ok(localIdx >= 0, 'local-declaration rule present');
        // Equal specificity for locals inside methods: the later rule wins.
        assert.ok(localIdx > fieldIdx, 'local (method) rule must come after field (class) rule');
        assert.strictEqual(rules[fieldIdx].settings.foreground, '#0000C0');
        assert.strictEqual(rules[localIdx].settings.foreground, '#6A3E3E');
    });

    it('eclipse light uses the classic Eclipse palette', () => {
        const t = getBuiltinTheme('eclipse-light');
        assert.strictEqual(t?.colors.keyword, '#7F0055');
        assert.strictEqual(t?.colors.string, '#2A00FF');
        assert.strictEqual(t?.colors.comment, '#3F7F5F');
    });

    it('darcula uses the classic IntelliJ palette', () => {
        const t = getBuiltinTheme('intellij-darcula');
        assert.strictEqual(t?.colors.keyword, '#CC7832');
        assert.strictEqual(t?.colors.string, '#6A8759');
        assert.strictEqual(t?.colors.field, '#9876AA');
        assert.strictEqual(t?.colors.methodDeclaration, '#FFC66D');
    });
});

describe('custom themes', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'javascope-themes-'));
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('validates theme files', () => {
        assert.deepStrictEqual(validateCustomTheme(null), ['theme file must contain a JSON object']);
        assert.deepStrictEqual(validateCustomTheme({}), []);
        assert.ok(validateCustomTheme({ name: '' })[0].includes('name'));
        assert.ok(validateCustomTheme({ type: 'neon' })[0].includes('type'));
        assert.ok(validateCustomTheme({ colors: { keyword: 'red' } })[0].includes('hex'));
        assert.ok(validateCustomTheme({ semanticRules: { class: '#FFF' } }).length === 0);
        // semanticRules accept plain colors or { foreground, fontStyle } objects.
        assert.deepStrictEqual(
            validateCustomTheme({ semanticRules: { 'property.static.readonly': { foreground: '#0000C0', fontStyle: 'bold italic' } } }),
            [],
        );
        assert.ok(validateCustomTheme({ semanticRules: { x: { foreground: 'blue' } } })[0].includes('foreground'));
        assert.ok(validateCustomTheme({ semanticRules: { x: { fontStyle: 42 } } })[0].includes('fontStyle'));
        assert.ok(validateCustomTheme({ semanticRules: { x: 42 } })[0].includes('semanticRules.x'));
    });

    it('discovers valid themes from user and workspace dirs', () => {
        const userDir = path.join(root, 'user');
        const wsDir = path.join(root, 'ws');
        fs.mkdirSync(path.join(userDir, 'themes'), { recursive: true });
        fs.mkdirSync(path.join(wsDir, 'themes'), { recursive: true });
        fs.writeFileSync(path.join(userDir, 'themes', 'my-theme.json'), JSON.stringify({ name: 'My Theme', type: 'dark', colors: { keyword: '#FF0000' } }));
        fs.writeFileSync(path.join(wsDir, 'themes', 'ws-theme.json'), JSON.stringify({ name: 'WS Theme' }));

        const result = discoverCustomThemes([
            { dir: userDir, origin: 'user' },
            { dir: wsDir, origin: 'workspace' },
        ]);
        assert.strictEqual(result.themes.length, 2);
        assert.strictEqual(result.errors.length, 0);
        const mine = result.themes.find((t) => t.id === 'custom:user:my-theme');
        assert.strictEqual(mine?.name, 'My Theme');
        assert.strictEqual(mine?.theme.colors.keyword, '#FF0000');
        // dark fallback fills unspecified slots
        assert.strictEqual(mine?.theme.colors.string, '#6A8759');
        const ws = result.themes.find((t) => t.id === 'custom:workspace:ws-theme');
        assert.strictEqual(ws?.type, 'dark');
    });

    it('reports invalid themes as errors instead of failing discovery', () => {
        const userDir = path.join(root, 'user');
        fs.mkdirSync(path.join(userDir, 'themes'), { recursive: true });
        fs.writeFileSync(path.join(userDir, 'themes', 'broken.json'), '{ nope');
        fs.writeFileSync(path.join(userDir, 'themes', 'wrong.json'), JSON.stringify({ colors: { keyword: 42 } }));

        const result = discoverCustomThemes([{ dir: userDir, origin: 'user' }]);
        assert.strictEqual(result.themes.length, 0);
        assert.strictEqual(result.errors.length, 2);
        assert.ok(result.errors[0].error.includes('invalid JSON'));
        assert.ok(result.errors[1].error.includes('colors.keyword'));
    });

    it('custom theme rules stay within Java/JSP scopes after resolution', () => {
        const userDir = path.join(root, 'user');
        fs.mkdirSync(path.join(userDir, 'themes'), { recursive: true });
        fs.writeFileSync(
            path.join(userDir, 'themes', 't.json'),
            JSON.stringify({ name: 'T', textMateRules: [{ scope: 'keyword', settings: { foreground: '#123456' } }] }),
        );
        const result = discoverCustomThemes([{ dir: userDir, origin: 'user' }]);
        assert.strictEqual(result.errors.length, 0); // user rules are passed through verbatim
    });
});
