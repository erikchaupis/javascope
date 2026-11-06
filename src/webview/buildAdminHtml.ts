import * as fs from 'fs';
import * as path from 'path';

/**
 * Builds the admin webview HTML from the Vite build output: inlines the JS
 * bundle (nonce-guarded, kept as type="module") and the CSS, and injects a
 * strict Content Security Policy.
 *
 * Pure function (no vscode API) so the output is unit-testable.
 */
export function buildAdminHtml(distDir: string, cspSource: string, nonce: string): string {
    const indexHtml = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexHtml)) {
        return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem">
<h2>JavaScope Administration</h2>
<p>The administration UI has not been built yet. Run <code>npm run build:webview</code> and reopen this panel.</p>
</body></html>`;
    }
    let html = fs.readFileSync(indexHtml, 'utf8');

    // Inline the built JS and CSS so a single CSP works.
    const scriptMatches = [...html.matchAll(/<script[^>]*src="\.\/assets\/([^"]+\.js)"[^>]*><\/script>/g)];
    const styleMatches = [...html.matchAll(/<link[^>]*href="\.\/assets\/([^"]+\.css)"[^>]*>/g)];

    for (const m of scriptMatches) {
        const file = path.join(distDir, 'assets', m[1]);
        const code = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        // Keep type="module": module scripts execute after the document is
        // parsed, so React can mount onto #root in <body>. A classic script
        // would run from <head> before #root exists and mount nothing.
        // Function replacement: a string replacement would interpret the
        // "$" sequences minified bundles contain ("$$typeof", "$&", "$'"),
        // corrupting the markup and spilling script text into the page.
        html = html.replace(m[0], () => `<script type="module" nonce="${nonce}">${code}</script>`);
    }
    for (const m of styleMatches) {
        const file = path.join(distDir, 'assets', m[1]);
        const css = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        html = html.replace(m[0], () => `<style>${css}</style>`);
    }

    const csp = [
        "default-src 'none'",
        `style-src 'unsafe-inline' ${cspSource}`,
        `script-src 'nonce-${nonce}'`,
        `img-src ${cspSource} data:`,
        `font-src ${cspSource}`,
    ].join('; ');
    html = html.replace(/<head>/, `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);
    return html;
}
