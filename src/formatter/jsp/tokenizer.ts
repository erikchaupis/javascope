/**
 * Structured tokenizer for JSP documents.
 *
 * Splits mixed JSP/HTML content into typed tokens without altering any text.
 * The parser builds a tolerant tree from these tokens; the renderer produces
 * the formatted output. Nothing here is regex-based formatting — tokens carry
 * exact source ranges so every byte of program text is preserved.
 */

export type JspTokenType =
    | 'directive'
    | 'declaration'
    | 'scriptlet'
    | 'expression'
    | 'jsp-comment'
    | 'html-comment'
    | 'doctype'
    | 'tag-open'
    | 'tag-close'
    | 'tag-selfclosing'
    | 'text';

export interface JspToken {
    type: JspTokenType;
    /** Exact source slice (no modifications). */
    raw: string;
    /** Start offset in the source. */
    start: number;
    /** End offset (exclusive). */
    end: number;
    /** For tags: element name. */
    name?: string;
    /** For tags: raw attribute text between the name and `>` or `/>`. */
    attrText?: string;
    /** For scriptlet/declaration/expression/directive: inner content. */
    inner?: string;
    /** True when a `\r\n` appears inside raw (affects re-joining). */
    hadCrLf?: boolean;
}

const TAG_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.:-]*/;

function isNameChar(ch: string): boolean {
    return /[A-Za-z0-9_.:-]/.test(ch);
}

/**
 * Tokenizes a JSP document. Tolerates malformed constructs by emitting them
 * as `text` tokens rather than failing.
 */
export function tokenizeJsp(source: string): JspToken[] {
    const tokens: JspToken[] = [];
    let i = 0;
    const n = source.length;
    let textStart = 0;

    const flushText = (end: number): void => {
        if (end > textStart) {
            tokens.push({ type: 'text', raw: source.slice(textStart, end), start: textStart, end });
        }
    };

    while (i < n) {
        const rest = source.slice(i);

        // JSP constructs start with `<%` or EL `${` (handled inside text).
        if (rest.startsWith('<%')) {
            const block = matchJspBlock(source, i);
            if (block) {
                flushText(i);
                tokens.push(block.token);
                i = block.end;
                textStart = i;
                continue;
            }
            // Not a real block: `<%` in plain text — skip ahead to avoid loop.
            i += 2;
            continue;
        }

        if (rest.startsWith('<!--')) {
            const end = source.indexOf('-->', i + 4);
            const stop = end === -1 ? n : end + 3;
            const raw = source.slice(i, stop);
            flushText(i);
            tokens.push({
                type: 'html-comment',
                raw,
                start: i,
                end: stop,
                inner: raw.slice(4, raw.length - (end === -1 ? 0 : 3)),
            });
            i = stop;
            textStart = i;
            continue;
        }

        if (rest.startsWith('<!DOCTYPE') || rest.startsWith('<!doctype')) {
            const stop = findTagEnd(source, i + 2);
            flushText(i);
            tokens.push({ type: 'doctype', raw: source.slice(i, stop), start: i, end: stop });
            i = stop;
            textStart = i;
            continue;
        }

        if (rest.startsWith('</')) {
            const m = rest.match(/^<\/\s*([A-Za-z_][A-Za-z0-9_.:-]*)\s*>/);
            if (m) {
                flushText(i);
                const stop = i + m[0].length;
                tokens.push({ type: 'tag-close', raw: m[0], start: i, end: stop, name: m[1] });
                i = stop;
                textStart = i;
                continue;
            }
            i += 2;
            continue;
        }

        if (rest.startsWith('<')) {
            const m = rest.match(/^<([A-Za-z_][A-Za-z0-9_.:-]*)/);
            if (m) {
                const stop = findTagEnd(source, i + 1);
                const raw = source.slice(i, stop);
                const selfClosing = /\/\s*>$/.test(raw);
                const attrText = extractAttrText(raw, m[1], selfClosing);
                flushText(i);
                tokens.push({
                    type: selfClosing ? 'tag-selfclosing' : 'tag-open',
                    raw,
                    start: i,
                    end: stop,
                    name: m[1],
                    attrText,
                });
                i = stop;
                textStart = i;
                continue;
            }
            // lone `<` in text
            i += 1;
            continue;
        }

        i += 1;
    }

    flushText(n);
    return tokens;
}

/** Finds the index just past the matching `>`, respecting quoted attributes. */
function findTagEnd(source: string, from: number): number {
    let quote: string | null = null;
    for (let j = from; j < source.length; j++) {
        const ch = source[j];
        if (quote) {
            if (ch === quote) {
                quote = null;
            }
            continue;
        }
        if (ch === '"' || ch === '\'') {
            quote = ch;
            continue;
        }
        if (ch === '>') {
            return j + 1;
        }
    }
    return source.length;
}

function extractAttrText(raw: string, name: string, selfClosing: boolean): string {
    let body = raw.substring(1 + name.length);
    body = body.replace(/>$/, '');
    if (selfClosing) {
        body = body.replace(/\/\s*$/, '');
    }
    return body;
}

interface MatchedBlock {
    token: JspToken;
    end: number;
}

function matchJspBlock(source: string, start: number): MatchedBlock | null {
    const n = source.length;
    const rest = source.slice(start);

    if (rest.startsWith('<%--')) {
        const end = source.indexOf('--%>', start + 4);
        const stop = end === -1 ? n : end + 4;
        const raw = source.slice(start, stop);
        return {
            token: {
                type: 'jsp-comment',
                raw,
                start,
                end: stop,
                inner: raw.slice(4, raw.length - (end === -1 ? 0 : 4)),
                hadCrLf: raw.includes('\r\n'),
            },
            end: stop,
        };
    }

    if (rest.startsWith('<%=')) {
        const end = source.indexOf('%>', start + 3);
        const stop = end === -1 ? n : end + 2;
        const raw = source.slice(start, stop);
        return {
            token: {
                type: 'expression',
                raw,
                start,
                end: stop,
                inner: raw.slice(3, raw.length - (end === -1 ? 0 : 2)),
                hadCrLf: raw.includes('\r\n'),
            },
            end: stop,
        };
    }

    if (rest.startsWith('<%!')) {
        const end = source.indexOf('%>', start + 3);
        const stop = end === -1 ? n : end + 2;
        const raw = source.slice(start, stop);
        return {
            token: {
                type: 'declaration',
                raw,
                start,
                end: stop,
                inner: raw.slice(3, raw.length - (end === -1 ? 0 : 2)),
                hadCrLf: raw.includes('\r\n'),
            },
            end: stop,
        };
    }

    if (rest.startsWith('<%@')) {
        const end = source.indexOf('%>', start + 3);
        const stop = end === -1 ? n : end + 2;
        const raw = source.slice(start, stop);
        return {
            token: {
                type: 'directive',
                raw,
                start,
                end: stop,
                inner: raw.slice(3, raw.length - (end === -1 ? 0 : 2)),
                hadCrLf: raw.includes('\r\n'),
            },
            end: stop,
        };
    }

    if (rest.startsWith('<%')) {
        const end = source.indexOf('%>', start + 2);
        const stop = end === -1 ? n : end + 2;
        const raw = source.slice(start, stop);
        return {
            token: {
                type: 'scriptlet',
                raw,
                start,
                end: stop,
                inner: raw.slice(2, raw.length - (end === -1 ? 0 : 2)),
                hadCrLf: raw.includes('\r\n'),
            },
            end: stop,
        };
    }

    return null;
}

/** Parses a tag's attribute text into ordered name/value pairs (EL-safe). */
export interface JspAttribute {
    name: string;
    value: string | null;
    /** Raw segment including separators, used to reconstruct spacing. */
    raw: string;
    /** Quote character used for the value, if any. */
    quote: '"' | '\'' | null;
}

export function parseAttributes(attrText: string): JspAttribute[] {
    const attrs: JspAttribute[] = [];
    let i = 0;
    const n = attrText.length;

    while (i < n) {
        while (i < n && /\s/.test(attrText[i])) {
            i++;
        }
        if (i >= n) {
            break;
        }
        const nameStart = i;
        while (i < n && isNameChar(attrText[i])) {
            i++;
        }
        const name = attrText.slice(nameStart, i);
        if (!name) {
            // Skip a stray character to guarantee progress.
            i++;
            continue;
        }
        let raw = attrText.slice(nameStart, i);
        while (i < n && /\s/.test(attrText[i])) {
            i++;
        }
        let value: string | null = null;
        let quote: '"' | '\'' | null = null;
        if (attrText[i] === '=') {
            raw += attrText.slice(nameStart + name.length, i + 1);
            i++;
            while (i < n && /\s/.test(attrText[i])) {
                i++;
            }
            if (attrText[i] === '"' || attrText[i] === '\'') {
                quote = attrText[i] as '"' | '\'';
                const vStart = ++i;
                while (i < n && attrText[i] !== quote) {
                    i++;
                }
                value = attrText.slice(vStart, i);
                raw += quote + value + (i < n ? quote : '');
                if (i < n) {
                    i++;
                }
            } else {
                const vStart = i;
                while (i < n && !/\s/.test(attrText[i])) {
                    i++;
                }
                value = attrText.slice(vStart, i);
                raw += value;
            }
        }
        attrs.push({ name, value, raw, quote });
    }
    return attrs;
}

/** HTML void elements never require a closing tag. */
export const VOID_ELEMENTS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
]);

/** Normalizes tag names for matching (JSP tags are case-sensitive XML-ish; HTML is not). */
export function tagNameEquals(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}

export { TAG_NAME_RE };
