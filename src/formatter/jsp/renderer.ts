import { JspFormatterProfile } from './profile';
import { parseAttributes } from './tokenizer';
import { JspNode } from './parser';

export type JavaSnippetKind = 'statements' | 'expression' | 'class-body';

export interface JspRenderContext {
    profile: JspFormatterProfile;
    /** Optional Java formatter for scriptlet/declaration/expression bodies. */
    formatJava?: (source: string, kind: JavaSnippetKind) => Promise<string>;
    indentUnit: string;
    lineWidth: number;
}

export function indentOf(ctx: JspRenderContext, level: number): string {
    return ctx.indentUnit.repeat(level);
}

/**
 * Strips the common leading indentation from all non-empty lines. JDT formats
 * scriptlet snippets as standalone sources, so its output may carry a base
 * indent of its own; the JSP renderer re-indents from the scriptlet's level,
 * and double indenting makes scriptlets look misaligned.
 */
function rebaseIndentation(code: string): string {
    const lines = code.split('\n');
    let min = Infinity;
    for (const line of lines) {
        if (line.trim().length === 0) {
            continue;
        }
        const indent = line.length - line.trimStart().length;
        if (indent < min) {
            min = indent;
        }
    }
    if (!Number.isFinite(min) || min === 0) {
        return code;
    }
    return lines.map((line) => (line.trim().length === 0 ? '' : line.slice(min))).join('\n');
}

function normalizeAttributes(attrsText: string): string {
    const attrs = parseAttributes(attrsText);
    if (attrs.length === 0) {
        return '';
    }
    return attrs
        .map((a) => {
            if (a.value === null) {
                return a.name;
            }
            const q = a.quote ?? '"';
            return `${a.name}=${q}${a.value}${q}`;
        })
        .join(' ');
}

/** Renders an open/self-closing tag, wrapping attributes when configured. */
function renderTagStart(
    node: Extract<JspNode, { kind: 'element' }>,
    level: number,
    ctx: JspRenderContext,
): string[] {
    const base = indentOf(ctx, level);
    const attrs = normalizeAttributes(node.attrsText);
    const closing = node.selfClosing ? '/>' : '>';
    const head = `<${node.name}${attrs ? ' ' + attrs : ''}`;
    const single = `${base}${head}${closing}`;

    const wrap = ctx.profile.html.wrapAttributes;
    if (attrs && (wrap === 'force' || (wrap === 'auto' && single.length > ctx.lineWidth))) {
        const parsed = parseAttributes(node.attrsText).map((a) => {
            if (a.value === null) {
                return a.name;
            }
            const q = a.quote ?? '"';
            return `${a.name}=${q}${a.value}${q}`;
        });
        const lines = [`${base}<${node.name}`];
        for (const a of parsed) {
            lines.push(`${indentOf(ctx, level + 1)}${a}`);
        }
        lines.push(`${base}${closing}`);
        return lines;
    }
    return [single];
}

/** Single-line rendering, or null when the node cannot be rendered inline. */
async function tryInline(node: JspNode, ctx: JspRenderContext, depth = 0): Promise<string | null> {
    if (depth > 32) {
        return null;
    }
    switch (node.kind) {
        case 'text': {
            const flat = node.text.replace(/\s+/g, ' ');
            const trimmed = flat.trim();
            // Reject multi-line source text (caller decides block layout).
            if (node.text.includes('\n')) {
                return null;
            }
            return trimmed.length === 0 ? '' : trimmed;
        }
        case 'jsp-comment':
        case 'html-comment': {
            if (node.inner.includes('\n')) {
                return null;
            }
            const inner = node.inner.trim();
            return node.kind === 'jsp-comment' ? `<%-- ${inner} --%>` : `<!-- ${inner} -->`;
        }
        case 'scriptlet':
        case 'declaration':
        case 'expression': {
            if (node.inner.includes('\n')) {
                return null;
            }
            const open = node.kind === 'scriptlet' ? '<%' : node.kind === 'declaration' ? '<%!' : '<%=';
            const kind: JavaSnippetKind =
                node.kind === 'scriptlet' ? 'statements' : node.kind === 'declaration' ? 'class-body' : 'expression';
            let code = node.inner.trim();
            if (code.length === 0) {
                return `${open} ${node.kind === 'expression' ? '' : ''}%>`.replace('  ', ' ');
            }
            if (ctx.profile.formatScriptletJava && ctx.formatJava) {
                try {
                    const formatted = await ctx.formatJava(code, kind);
                    if (formatted && formatted.trim().length > 0) {
                        code = rebaseIndentation(formatted.replace(/\r\n/g, '\n').trim());
                    }
                } catch {
                    // keep original code
                }
            }
            if (code.includes('\n')) {
                return null;
            }
            const single = `${open} ${code} %>`;
            return single.length <= ctx.lineWidth ? single : null;
        }
        case 'directive': {
            const lines = renderDirective(node.inner, 0, ctx);
            return lines.length === 1 && lines[0].length <= ctx.lineWidth ? lines[0] : null;
        }
        case 'doctype':
            return node.raw.trim();
        case 'element': {
            const start = renderTagStart(node, 0, ctx);
            if (start.length > 1) {
                return null; // attributes wrapped: block form
            }
            const open = start[0];
            if (node.selfClosing) {
                return open;
            }
            const parts: string[] = [];
            for (const child of node.children) {
                const inline = await tryInline(child, ctx, depth + 1);
                if (inline === null) {
                    return null;
                }
                if (inline.length > 0) {
                    parts.push(inline);
                }
            }
            const inner = parts.join(' ');
            const name = node.name;
            return inner.length === 0 ? `${open}</${name}>` : `${open}${inner}</${name}>`;
        }
        case 'root':
            return null;
    }
}

/** Renders text across multiple lines, preserving relative indentation. */
function renderTextBlock(text: string, level: number, ctx: JspRenderContext): string[] {
    const lines = text.split('\n');
    // Determine minimum indentation of non-empty lines after the first.
    let minIndent = Infinity;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().length === 0) {
            continue;
        }
        const leading = line.match(/^[ \t]*/)?.[0].length ?? 0;
        minIndent = Math.min(minIndent, leading);
    }
    if (!Number.isFinite(minIndent)) {
        minIndent = 0;
    }

    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            out.push('');
            continue;
        }
        if (i === 0) {
            out.push(indentOf(ctx, level) + trimmed);
        } else {
            const relative = line.slice(0, Math.min(line.length, minIndent));
            out.push(indentOf(ctx, level) + relative + trimmed);
        }
    }
    return out;
}

async function renderJavaBlock(
    open: string,
    close: string,
    inner: string,
    kind: JavaSnippetKind,
    level: number,
    ctx: JspRenderContext,
    forceMultiline: boolean,
): Promise<string[]> {
    const base = indentOf(ctx, level);
    const codeIndent = indentOf(ctx, level + 1);
    const trimmed = inner.trim();

    let code = trimmed;
    if (trimmed.length > 0 && ctx.profile.formatScriptletJava && ctx.formatJava) {
        try {
            const formatted = await ctx.formatJava(trimmed, kind);
            if (formatted && formatted.trim().length > 0) {
                code = rebaseIndentation(formatted.replace(/\r\n/g, '\n').trim());
            }
        } catch {
            // Keep original code on any failure: never corrupt scriptlets.
        }
    }

    const singleLine = `${base}${open} ${code} ${close}`;
    if (!forceMultiline && !inner.includes('\n') && code.length > 0 && singleLine.length <= ctx.lineWidth) {
        return [singleLine];
    }
    if (trimmed.length === 0) {
        return [`${base}${open} ${close}`];
    }
    const lines = [`${base}${open}`];
    for (const line of code.split('\n')) {
        lines.push(line.trim().length === 0 ? '' : codeIndent + line.trimEnd());
    }
    lines.push(`${base}${close}`);
    return lines;
}

function renderComment(
    open: string,
    close: string,
    inner: string,
    level: number,
    ctx: JspRenderContext,
): string[] {
    const base = indentOf(ctx, level);
    if (!inner.includes('\n')) {
        const single = `${base}${open} ${inner.trim()} ${close}`;
        if (single.length <= ctx.lineWidth) {
            return [single];
        }
    }
    const body = inner.replace(/\r\n/g, '\n').replace(/^[ \t]*\n/, '').replace(/\n[ \t]*$/, '');
    if (body.trim().length === 0) {
        return [`${base}${open} ${close}`];
    }
    const lines = [`${base}${open}`];
    for (const line of body.split('\n')) {
        lines.push(line.trim().length === 0 ? '' : indentOf(ctx, level + 1) + line.trim());
    }
    lines.push(`${base}${close}`);
    return lines;
}

function renderDirective(inner: string, level: number, ctx: JspRenderContext): string[] {
    const base = indentOf(ctx, level);
    const trimmed = inner.trim();
    if (trimmed.length === 0) {
        return [`${base}<%@ %>`];
    }
    const spaceIdx = trimmed.search(/[\s]/);
    const keyword = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);
    const attrs = normalizeAttributes(rest);
    const single = `${base}<%@ ${keyword}${attrs ? ' ' + attrs : ''} %>`;
    if (single.length <= ctx.lineWidth || !attrs) {
        return [single];
    }
    const parsed = parseAttributes(rest).map((a) => {
        if (a.value === null) {
            return a.name;
        }
        const q = a.quote ?? '"';
        return `${a.name}=${q}${a.value}${q}`;
    });
    const lines = [`${base}<%@ ${keyword}`];
    for (const a of parsed) {
        lines.push(`${indentOf(ctx, level + 1)}${a}`);
    }
    lines.push(`${base}%>`);
    return lines;
}

async function renderNode(node: JspNode, level: number, ctx: JspRenderContext): Promise<string[]> {
    switch (node.kind) {
        case 'text': {
            if (node.text.trim().length === 0) {
                return [];
            }
            if (!node.text.includes('\n')) {
                return [indentOf(ctx, level) + node.text.trim()];
            }
            return renderTextBlock(node.text, level, ctx);
        }
        case 'element': {
            if (ctx.profile.keepInlineIfShort) {
                const inline = await tryInline(node, ctx);
                if (inline !== null) {
                    const candidate = indentOf(ctx, level) + inline;
                    if (candidate.length <= ctx.lineWidth) {
                        return [candidate];
                    }
                }
            }
            const startLines = renderTagStart(node, level, ctx);
            if (node.selfClosing) {
                return startLines;
            }
            const lines = [...startLines];
            for (const child of node.children) {
                lines.push(...(await renderNode(child, level + 1, ctx)));
            }
            lines.push(`${indentOf(ctx, level)}</${node.name}>`);
            return lines;
        }
        case 'directive':
            return renderDirective(node.inner, level, ctx);
        case 'scriptlet':
            return renderJavaBlock('<%', '%>', node.inner, 'statements', level, ctx, node.inner.includes('\n'));
        case 'declaration':
            return renderJavaBlock('<%!', '%>', node.inner, 'class-body', level, ctx, node.inner.includes('\n'));
        case 'expression':
            return renderJavaBlock('<%=', '%>', node.inner, 'expression', level, ctx, node.inner.includes('\n'));
        case 'jsp-comment':
            return renderComment('<%--', '--%>', node.inner, level, ctx);
        case 'html-comment':
            return renderComment('<!--', '-->', node.inner, level, ctx);
        case 'doctype':
            return [indentOf(ctx, level) + node.raw.trim()];
        case 'root':
            return renderChildren(node.children, level, ctx);
    }
}

async function renderChildren(children: JspNode[], level: number, ctx: JspRenderContext): Promise<string[]> {
    const lines: string[] = [];
    for (const child of children) {
        lines.push(...(await renderNode(child, level, ctx)));
    }
    return lines;
}

/**
 * Post-processing: collapse blank runs, enforce `blankLineAfterDirective`,
 * trim trailing whitespace.
 */
export function finalizeLines(lines: string[], ctx: JspRenderContext): string[] {
    const maxBlank = ctx.profile.maxBlankLines;

    // Trim trailing whitespace.
    const trimmed = ctx.profile.trimTrailingWhitespace ? lines.map((l) => l.replace(/[ \t]+$/, '')) : [...lines];

    // Enforce blank line after directive groups at top level.
    const withDirectiveBlanks: string[] = [];
    if (ctx.profile.blankLineAfterDirective) {
        for (let i = 0; i < trimmed.length; i++) {
            const line = trimmed[i];
            withDirectiveBlanks.push(line);
            const isDirective = line.trimStart().startsWith('<%@');
            const next = trimmed[i + 1];
            if (
                isDirective &&
                next !== undefined &&
                next.trim().length > 0 &&
                !next.trimStart().startsWith('<%@')
            ) {
                withDirectiveBlanks.push('');
            }
        }
    } else {
        withDirectiveBlanks.push(...trimmed);
    }

    // Collapse blank runs.
    const collapsed: string[] = [];
    let blankRun = 0;
    for (const line of withDirectiveBlanks) {
        if (line.trim().length === 0) {
            blankRun++;
            if (blankRun <= maxBlank) {
                collapsed.push('');
            }
        } else {
            blankRun = 0;
            collapsed.push(line);
        }
    }

    // Trim leading/trailing blank lines.
    while (collapsed.length > 0 && collapsed[0].trim().length === 0) {
        collapsed.shift();
    }
    while (collapsed.length > 0 && collapsed[collapsed.length - 1].trim().length === 0) {
        collapsed.pop();
    }
    return collapsed;
}

export { renderNode, renderChildren, tryInline, normalizeAttributes };
