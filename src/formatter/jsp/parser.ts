import { JspToken, VOID_ELEMENTS, tagNameEquals } from './tokenizer';

/** Tree nodes built from tokens. All source text is preserved exactly. */
export type JspNode =
    | { kind: 'root'; children: JspNode[] }
    | { kind: 'text'; text: string }
    | { kind: 'element'; name: string; attrsText: string; children: JspNode[]; selfClosing: boolean }
    | { kind: 'directive'; inner: string }
    | { kind: 'scriptlet'; inner: string }
    | { kind: 'declaration'; inner: string }
    | { kind: 'expression'; inner: string }
    | { kind: 'jsp-comment'; inner: string }
    | { kind: 'html-comment'; inner: string }
    | { kind: 'doctype'; raw: string };

export interface ParseResult {
    root: JspNode;
    /**
     * True when the document could not be structured safely (unclosed tags,
     * mismatched close tags). Callers should fall back to conservative
     * formatting that never invents or removes tags.
     */
    unstable: boolean;
}

/**
 * Builds a tolerant element tree from tokens.
 *
 * Mismatch recovery: a close tag that does not match the open element on top
 * of the stack first tries to close an outer element (implicit closes like
 * `<li>` siblings); if none matches, parsing is marked unstable.
 */
export function parseJsp(tokens: JspToken[]): ParseResult {
    const root: JspNode = { kind: 'root', children: [] };
    const stack: Array<Extract<JspNode, { kind: 'element' }>> = [];
    let unstable = false;

    const currentChildren = (): JspNode[] => (stack.length > 0 ? stack[stack.length - 1].children : root.children);

    for (const token of tokens) {
        switch (token.type) {
            case 'text':
                currentChildren().push({ kind: 'text', text: token.raw });
                break;
            case 'directive':
                currentChildren().push({ kind: 'directive', inner: token.inner ?? '' });
                break;
            case 'scriptlet':
                currentChildren().push({ kind: 'scriptlet', inner: token.inner ?? '' });
                break;
            case 'declaration':
                currentChildren().push({ kind: 'declaration', inner: token.inner ?? '' });
                break;
            case 'expression':
                currentChildren().push({ kind: 'expression', inner: token.inner ?? '' });
                break;
            case 'jsp-comment':
                currentChildren().push({ kind: 'jsp-comment', inner: token.inner ?? '' });
                break;
            case 'html-comment':
                currentChildren().push({ kind: 'html-comment', inner: token.inner ?? '' });
                break;
            case 'doctype':
                currentChildren().push({ kind: 'doctype', raw: token.raw });
                break;
            case 'tag-selfclosing':
                currentChildren().push({
                    kind: 'element',
                    name: token.name ?? '',
                    attrsText: token.attrText ?? '',
                    children: [],
                    selfClosing: true,
                });
                break;
            case 'tag-open': {
                const el: Extract<JspNode, { kind: 'element' }> = {
                    kind: 'element',
                    name: token.name ?? '',
                    attrsText: token.attrText ?? '',
                    children: [],
                    selfClosing: false,
                };
                currentChildren().push(el);
                if (!(token.name && VOID_ELEMENTS.has(token.name.toLowerCase()))) {
                    stack.push(el);
                }
                break;
            }
            case 'tag-close': {
                const name = token.name ?? '';
                if (stack.length === 0) {
                    unstable = true;
                    break;
                }
                const top = stack[stack.length - 1];
                if (tagNameEquals(top.name, name)) {
                    stack.pop();
                    break;
                }
                // Search for a matching outer element (implicit close of inner ones).
                const idx = stack.findIndex((el) => tagNameEquals(el.name, name));
                if (idx === -1) {
                    // Close tag with no matching open tag: mark unstable, keep raw via text.
                    unstable = true;
                    currentChildren().push({ kind: 'text', text: token.raw });
                    break;
                }
                // Implicitly close everything above it.
                while (stack.length > idx) {
                    stack.pop();
                }
                stack.pop();
                break;
            }
        }
    }

    if (stack.length > 0) {
        // Unclosed elements at EOF: the tree is missing information; stay safe.
        unstable = true;
    }

    return { root, unstable };
}
