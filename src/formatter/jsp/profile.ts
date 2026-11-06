/** JSP formatter profile model, validation and defaults. */

export interface JspIndentation {
    style: 'space' | 'tab';
    size: number;
}

export type JspWrapAttributes = 'auto' | 'force' | 'preserve';

export interface JspFormatterProfile {
    id: string;
    name: string;
    indentation: JspIndentation;
    /** Maximum line width before attributes are wrapped onto separate lines. */
    lineWidth: number;
    /** Consecutive blank lines are collapsed to at most this number. */
    maxBlankLines: number;
    trimTrailingWhitespace: boolean;
    /** Format Java code inside scriptlets/declarations/expressions via Eclipse JDT. */
    formatScriptletJava: boolean;
    /** Insert a blank line after top-level JSP directives. */
    blankLineAfterDirective: boolean;
    /** Keep elements with short text-only content on a single line. */
    keepInlineIfShort: boolean;
    html: {
        wrapAttributes: JspWrapAttributes;
    };
}

export const BUILTIN_JSP_PROFILE: JspFormatterProfile = {
    id: 'builtin:jsp:default',
    name: 'JavaScope JSP Default',
    indentation: { style: 'space', size: 4 },
    lineWidth: 120,
    maxBlankLines: 1,
    trimTrailingWhitespace: true,
    formatScriptletJava: true,
    blankLineAfterDirective: true,
    keepInlineIfShort: true,
    html: {
        wrapAttributes: 'auto',
    },
};

/** Loose shape of a JSP profile JSON file. */
export interface JspProfileFile {
    id?: string;
    name?: string;
    indentation?: Partial<JspIndentation>;
    lineWidth?: number;
    maxBlankLines?: number;
    trimTrailingWhitespace?: boolean;
    formatScriptletJava?: boolean;
    blankLineAfterDirective?: boolean;
    keepInlineIfShort?: boolean;
    html?: { wrapAttributes?: JspWrapAttributes };
    [key: string]: unknown;
}

export function validateJspProfile(doc: unknown): string[] {
    const problems: string[] = [];
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
        problems.push('profile must be a JSON object');
        return problems;
    }
    const o = doc as Record<string, unknown>;
    if (o.name !== undefined && typeof o.name !== 'string') {
        problems.push('"name" must be a string');
    }
    if (o.indentation !== undefined) {
        if (typeof o.indentation !== 'object' || o.indentation === null) {
            problems.push('"indentation" must be an object');
        } else {
            const ind = o.indentation as Record<string, unknown>;
            if (ind.style !== undefined && ind.style !== 'space' && ind.style !== 'tab') {
                problems.push('"indentation.style" must be "space" or "tab"');
            }
            if (ind.size !== undefined && (!Number.isInteger(ind.size) || (ind.size as number) < 1 || (ind.size as number) > 16)) {
                problems.push('"indentation.size" must be an integer between 1 and 16');
            }
        }
    }
    if (o.lineWidth !== undefined && (!Number.isInteger(o.lineWidth) || (o.lineWidth as number) < 40)) {
        problems.push('"lineWidth" must be an integer >= 40');
    }
    if (o.maxBlankLines !== undefined && (!Number.isInteger(o.maxBlankLines) || (o.maxBlankLines as number) < 0)) {
        problems.push('"maxBlankLines" must be an integer >= 0');
    }
    for (const key of ['trimTrailingWhitespace', 'formatScriptletJava', 'blankLineAfterDirective', 'keepInlineIfShort']) {
        if (o[key] !== undefined && typeof o[key] !== 'boolean') {
            problems.push(`"${key}" must be a boolean`);
        }
    }
    if (o.html !== undefined) {
        if (typeof o.html !== 'object' || o.html === null) {
            problems.push('"html" must be an object');
        } else {
            const wrap = (o.html as Record<string, unknown>).wrapAttributes;
            if (wrap !== undefined && wrap !== 'auto' && wrap !== 'force' && wrap !== 'preserve') {
                problems.push('"html.wrapAttributes" must be one of: auto, force, preserve');
            }
        }
    }
    return problems;
}

export function normalizeJspProfile(file: JspProfileFile, id: string): JspFormatterProfile {
    const base = BUILTIN_JSP_PROFILE;
    const indentation = file.indentation ?? {};
    const html = file.html ?? {};
    return {
        id,
        name: typeof file.name === 'string' && file.name.length > 0 ? file.name : 'Unnamed profile',
        indentation: {
            style: indentation.style === 'tab' ? 'tab' : 'space',
            size: Number.isInteger(indentation.size) ? (indentation.size as number) : base.indentation.size,
        },
        lineWidth: Number.isInteger(file.lineWidth) ? (file.lineWidth as number) : base.lineWidth,
        maxBlankLines:
            Number.isInteger(file.maxBlankLines) && (file.maxBlankLines as number) >= 0
                ? (file.maxBlankLines as number)
                : base.maxBlankLines,
        trimTrailingWhitespace: file.trimTrailingWhitespace ?? base.trimTrailingWhitespace,
        formatScriptletJava: file.formatScriptletJava ?? base.formatScriptletJava,
        blankLineAfterDirective: file.blankLineAfterDirective ?? base.blankLineAfterDirective,
        keepInlineIfShort: file.keepInlineIfShort ?? base.keepInlineIfShort,
        html: {
            wrapAttributes: html.wrapAttributes ?? base.html.wrapAttributes,
        },
    };
}
