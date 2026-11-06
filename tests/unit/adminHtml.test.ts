import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { buildAdminHtml } from '../../src/webview/buildAdminHtml';

describe('buildAdminHtml', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'javascope-html-'));
        const assets = path.join(dir, 'assets');
        fs.mkdirSync(assets, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'index.html'),
            [
                '<!DOCTYPE html><html><head>',
                '<script type="module" crossorigin src="./assets/index.js"></script>',
                '<link rel="stylesheet" crossorigin href="./assets/index.css">',
                '</head><body><div id="root"></div></body></html>',
            ].join('\n'),
        );
        // Bundle shape that broke the panel in real life: "$" sequences from
        // minification must survive inlining byte-for-byte.
        fs.writeFileSync(
            path.join(assets, 'index.js'),
            'var $$typeof=Symbol.for("react.element"),s="$&",t="$\'",u="$$";\nrc(document.getElementById("root")).render(App);',
        );
        fs.writeFileSync(path.join(assets, 'index.css'), 'body{margin:0}');
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('inlines the bundle exactly, preserving "$" sequences', () => {
        const html = buildAdminHtml(dir, 'vscode-webview://x', 'NONCE123');
        assert.ok(html.includes('$$typeof=Symbol.for'), '$$typeof corrupted');
        assert.ok(html.includes('"$&"'), '$& corrupted');
        assert.ok(html.includes('"$\'"'), "$' corrupted");
        assert.ok(html.includes('"$$"'), '$$ corrupted');
    });

    it('produces a single balanced script tag kept as type="module"', () => {
        const html = buildAdminHtml(dir, 'vscode-webview://x', 'NONCE123');
        assert.strictEqual((html.match(/<script/g) ?? []).length, 1);
        assert.strictEqual((html.match(/<\/script>/g) ?? []).length, 1);
        assert.ok(/<script type="module" nonce="NONCE123">/.test(html), 'module+nonce tag missing');
    });

    it('inlines css and injects the CSP meta in head', () => {
        const html = buildAdminHtml(dir, 'vscode-webview://csp', 'NONCE123');
        assert.ok(html.includes('<style>body{margin:0}</style>'));
        assert.ok(html.includes('<head><meta http-equiv="Content-Security-Policy"'));
        assert.ok(html.includes("script-src 'nonce-NONCE123'"));
        assert.ok(html.includes('vscode-webview://csp'));
    });

    it('returns the fallback message when the webview build is missing', () => {
        const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'javascope-empty-'));
        const html = buildAdminHtml(empty, 'vscode-webview://x', 'N');
        assert.ok(html.includes('has not been built yet'));
        fs.rmSync(empty, { recursive: true, force: true });
    });
});
