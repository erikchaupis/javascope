import { tokenizeJsp } from './tokenizer';
import { parseJsp } from './parser';
import { finalizeLines, JavaSnippetKind, JspRenderContext, renderChildren } from './renderer';
import { JspFormatterProfile } from './profile';

export interface JspFormatOptions {
    profile: JspFormatterProfile;
    formatJava?: (source: string, kind: JavaSnippetKind) => Promise<string>;
}

function detectLineSeparator(source: string): string {
    const idx = source.indexOf('\n');
    if (idx > 0 && source.charAt(idx - 1) === '\r') {
        return '\r\n';
    }
    return '\n';
}

/**
 * Formats a JSP document.
 *
 * Stable (well-formed) documents get full structured formatting. Documents
 * with unbalanced tags fall back to a conservative pass that still formats
 * Java scriptlet bodies and applies whitespace hygiene, but never invents,
 * moves or removes tags.
 */
export async function formatJsp(source: string, options: JspFormatOptions): Promise<string> {
    const lineSeparator = detectLineSeparator(source);
    const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const profile = options.profile;
    const indentUnit = profile.indentation.style === 'tab' ? '\t' : ' '.repeat(profile.indentation.size);
    const ctx: JspRenderContext = {
        profile,
        formatJava: options.formatJava,
        indentUnit,
        lineWidth: profile.lineWidth,
    };

    const tokens = tokenizeJsp(normalized);
    const { root, unstable } = parseJsp(tokens);

    let lines: string[];
    if (unstable || root.kind !== 'root') {
        lines = await conservativeFormat(tokens, ctx);
    } else {
        lines = await renderChildren(root.children, 0, ctx);
    }
    lines = finalizeLines(lines, ctx);

    let out = lines.join('\n');
    if (out.length > 0) {
        out += '\n';
    }
    if (lineSeparator !== '\n') {
        out = out.replace(/\n/g, lineSeparator);
    }
    return out;
}

/**
 * Conservative mode for documents we cannot structure safely: formats Java
 * bodies inside JSP blocks and normalizes trailing whitespace/blank lines,
 * but leaves all markup layout untouched.
 */
async function conservativeFormat(
    tokens: ReturnType<typeof tokenizeJsp>,
    ctx: JspRenderContext,
): Promise<string[]> {
    const parts: string[] = [];
    for (const token of tokens) {
        if (
            (token.type === 'scriptlet' || token.type === 'declaration' || token.type === 'expression') &&
            ctx.profile.formatScriptletJava &&
            ctx.formatJava &&
            token.inner !== undefined
        ) {
            const kind: JavaSnippetKind =
                token.type === 'scriptlet'
                    ? 'statements'
                    : token.type === 'declaration'
                      ? 'class-body'
                      : 'expression';
            let code = token.inner;
            try {
                const formatted = await ctx.formatJava(token.inner, kind);
                if (formatted && formatted.trim().length > 0) {
                    code = formatted.replace(/\r\n/g, '\n');
                }
            } catch {
                // keep original
            }
            const open = token.type === 'scriptlet' ? '<%' : token.type === 'declaration' ? '<%!' : '<%=';
            parts.push(open + code + '%>');
        } else {
            parts.push(token.raw);
        }
    }
    const joined = parts.join('');
    return joined.split('\n');
}
