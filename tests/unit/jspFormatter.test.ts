import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { formatJsp } from '../../src/formatter/jsp/formatter';
import { BUILTIN_JSP_PROFILE, JspFormatterProfile } from '../../src/formatter/jsp/profile';

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'jsp');

function fixture(name: string): string {
    return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

async function fmt(source: string, profile: JspFormatterProfile = BUILTIN_JSP_PROFILE): Promise<string> {
    return formatJsp(source, { profile });
}

describe('JSP formatter', () => {
    it('formats the canonical spec example', async () => {
        const out = await fmt(fixture('spec-sample-unformatted.jsp'));
        assert.strictEqual(out, fixture('spec-sample-formatted.jsp'));
    });

    it('is idempotent on the spec example', async () => {
        const once = await fmt(fixture('spec-sample-unformatted.jsp'));
        const twice = await fmt(once);
        assert.strictEqual(once, twice);
    });

    it('formats an already formatted document without changes', async () => {
        const formatted = fixture('spec-sample-formatted.jsp');
        const out = await fmt(formatted);
        assert.strictEqual(out, formatted);
    });

    it('preserves JSP directives and adds a blank line after them', async () => {
        const out = await fmt(fixture('directives-comments.jsp'));
        assert.ok(out.startsWith('<%@ page import="java.util.*, java.io.*" session="false" %>\n\n'));
        assert.ok(out.includes('<%-- page header template --%>'));
        assert.ok(out.includes('<!-- generated on build server -->'));
    });

    it('preserves EL expressions in text and attributes', async () => {
        const out = await fmt(fixture('el-expressions.jsp'));
        assert.ok(out.includes('${not empty user && user.active}'));
        assert.ok(out.includes('class="${user.vip ? \'vip\' : \'normal\'}"'));
        assert.ok(out.includes('${fn:escapeXml(user.bio)}'));
        // self-closing tag with attributes preserved
        assert.ok(out.includes('<input value="${fn:escapeXml(user.bio)}" size="40"/>'));
    });

    it('handles nested JSTL/HTML structures', async () => {
        const out = await fmt(fixture('nested-unformatted.jsp'));
        const lines = out.split('\n');
        const forEachIdx = lines.findIndex((l) => l.includes('<c:forEach'));
        const tableIdx = lines.findIndex((l) => l.includes('<table>'));
        const trIdx = lines.findIndex((l) => l.trim() === '<tr>');
        assert.ok(tableIdx !== -1 && forEachIdx > tableIdx, 'c:forEach nested inside table');
        assert.ok(trIdx > forEachIdx, 'tr nested inside c:forEach');
        assert.ok(
            lines[forEachIdx].startsWith('            '),
            'c:forEach indented one level deeper than table',
        );
    });

    it('keeps short elements inline and wraps long content', async () => {
        const out = await fmt('<div>\n<p>short</p>\n</div>\n');
        assert.ok(out.includes('<p>short</p>'));
        const longText = 'word '.repeat(200).trim();
        const out2 = await fmt(`<div>\n<p>${longText}</p>\n</div>\n`);
        // long single-line text becomes a block child (text is never hard-wrapped)
        assert.ok(out2.includes('<p>\n'));
        assert.ok(out2.includes(`\n        ${longText}\n`));
        assert.ok(out2.includes('\n    </p>'));
    });

    it('falls back to conservative formatting for unbalanced markup', async () => {
        const source = fixture('unstable.jsp');
        const out = await fmt(source);
        // tag layout must be untouched
        assert.ok(out.includes('<div>\n<p>unclosed paragraph'));
        // directive blank line hygiene still applied
        assert.ok(out.startsWith('<%@ page language="java" %>\n'));
        // no invented closing tags
        assert.ok(!out.includes('</div>'));
    });

    it('formats Java scriptlets when a Java formatter is provided', async () => {
        const source = '<%\nString s="x";\nint y=1;\n%>\n';
        const fakeFormat = async (code: string): Promise<string> => {
            assert.strictEqual(code, 'String s="x";\nint y=1;');
            return 'String s = "x";\nint y = 1;';
        };
        const out = await formatJsp(source, { profile: BUILTIN_JSP_PROFILE, formatJava: fakeFormat });
        assert.ok(out.includes('String s = "x";'));
        assert.ok(out.includes('int y = 1;'));
    });

    it('keeps original scriptlet code when the Java formatter fails', async () => {
        const source = '<%\nthis is not java at all (((\n%>\n';
        const failing = async (): Promise<string> => {
            throw new Error('parse error');
        };
        const out = await formatJsp(source, { profile: BUILTIN_JSP_PROFILE, formatJava: failing });
        assert.ok(out.includes('this is not java at all ((('));
        assert.ok(out.includes('<%'));
        assert.ok(out.includes('%>'));
    });

    it('supports tab indentation profiles', async () => {
        const profile: JspFormatterProfile = {
            ...BUILTIN_JSP_PROFILE,
            indentation: { style: 'tab', size: 1 },
        };
        const out = await fmt('<div>\n<p>x</p>\n</div>\n', profile);
        assert.ok(out.includes('\n\t<p>x</p>\n'));
    });

    it('supports 2-space indentation profiles', async () => {
        const profile: JspFormatterProfile = { ...BUILTIN_JSP_PROFILE, indentation: { style: 'space', size: 2 } };
        const out = await fmt('<div>\n<p>x</p>\n</div>\n', profile);
        assert.ok(out.includes('\n  <p>x</p>\n'));
    });

    it('collapses excess blank lines to maxBlankLines', async () => {
        const profile: JspFormatterProfile = { ...BUILTIN_JSP_PROFILE, maxBlankLines: 1 };
        const out = await fmt('<div>\n\n\n\n<p>x</p>\n</div>\n', profile);
        assert.ok(!out.includes('\n\n\n'));
    });

    it('honors trimTrailingWhitespace', async () => {
        const out = await fmt('<div>   \n<p>x</p>   \n</div>\n');
        assert.ok(!/[ \t]+\n/.test(out));
    });

    it('preserves CRLF line endings', async () => {
        const source = '<div>\r\n<p>x</p>\r\n</div>\r\n';
        const out = await fmt(source);
        assert.ok(out.includes('\r\n'));
        assert.ok(!/\r[^\n]/.test(out));
        const normalized = out.replace(/\r\n/g, '\n');
        assert.strictEqual(normalized, '<div>\n    <p>x</p>\n</div>\n');
    });

    it('normalizes messy attribute spacing', async () => {
        const out = await fmt('<c:out   value="${x}"   escapeXml="false"/>\n');
        assert.ok(out.includes('<c:out value="${x}" escapeXml="false"/>'));
    });

    it('wraps long attribute lists according to lineWidth', async () => {
        const profile: JspFormatterProfile = { ...BUILTIN_JSP_PROFILE, lineWidth: 40 };
        const out = await fmt('<div class="container" id="main" data-role="wrapper"><p>x</p></div>\n', profile);
        assert.ok(out.includes('<div\n'));
        assert.ok(out.includes('class="container"'));
        assert.ok(out.includes('>'));
    });

    it('produces a trailing newline and no leading blank lines', async () => {
        const out = await fmt('\n\n\n<p>x</p>\n\n\n');
        assert.ok(out.endsWith('\n'));
        assert.ok(!out.endsWith('\n\n'));
        assert.ok(!out.startsWith('\n'));
    });

    it('never corrupts directives or EL even in conservative mode', async () => {
        const source = '<%@ taglib prefix="c" uri="urn:x" %>\n<div>\n${user.name}\n';
        const out = await fmt(source);
        assert.ok(out.includes('<%--') === false); // no invented comments
        assert.ok(out.includes('${user.name}'));
        assert.ok(out.includes('uri="urn:x"'));
    });
});
