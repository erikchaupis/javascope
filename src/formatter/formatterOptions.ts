/**
 * Friendly subset of Eclipse JDT formatter options exposed in the admin UI,
 * plus pure helpers to read/merge/write CodeFormatterProfile XML.
 *
 * The XML helpers are intentionally regex-based: profile files are
 * machine-generated with one `<setting id="..." value="..."/>` per line, so
 * preserving the original document around the settings block is both safe
 * and lossless.
 */

export interface FormatterOptionDef {
    /** Stable form key. */
    key: string;
    label: string;
    group: 'Indentation' | 'Braces' | 'Spacing' | 'Line width';
    kind: 'enum' | 'int' | 'bool';
    choices?: Array<{ value: string; label: string }>;
    /** One Eclipse setting id, or several (the value is applied to all). */
    ids: string[];
    min?: number;
    max?: number;
    /** Value written when the checkbox is on. */
    onValue?: string;
    /** Value written when the checkbox is off. */
    offValue?: string;
    defaultValue: string;
}

const P = 'org.eclipse.jdt.core.formatter.';

export const FORMATTER_OPTION_DEFS: FormatterOptionDef[] = [
    {
        key: 'tabPolicy',
        label: 'Tab policy',
        group: 'Indentation',
        kind: 'enum',
        ids: [P + 'tabulation.char'],
        choices: [
            { value: 'tab', label: 'Tabs' },
            { value: 'space', label: 'Spaces' },
        ],
        defaultValue: 'tab',
    },
    {
        key: 'indentSize',
        label: 'Indentation size',
        group: 'Indentation',
        kind: 'int',
        ids: [P + 'indentation.size'],
        min: 1,
        max: 16,
        defaultValue: '4',
    },
    {
        key: 'tabSize',
        label: 'Displayed tab size',
        group: 'Indentation',
        kind: 'int',
        ids: [P + 'tabulation.size'],
        min: 1,
        max: 16,
        defaultValue: '4',
    },
    {
        key: 'braceType',
        label: 'Class / interface braces',
        group: 'Braces',
        kind: 'enum',
        ids: [P + 'brace_position_for_type_declaration'],
        choices: [
            { value: 'end_of_line', label: 'Same line' },
            { value: 'next_line', label: 'Next line' },
        ],
        defaultValue: 'end_of_line',
    },
    {
        key: 'braceMethod',
        label: 'Method braces',
        group: 'Braces',
        kind: 'enum',
        ids: [P + 'brace_position_for_method_declaration'],
        choices: [
            { value: 'end_of_line', label: 'Same line' },
            { value: 'next_line', label: 'Next line' },
        ],
        defaultValue: 'end_of_line',
    },
    {
        key: 'braceBlock',
        label: 'Block braces (if / for / while)',
        group: 'Braces',
        kind: 'enum',
        ids: [P + 'brace_position_for_block'],
        choices: [
            { value: 'end_of_line', label: 'Same line' },
            { value: 'next_line', label: 'Next line' },
        ],
        defaultValue: 'end_of_line',
    },
    {
        key: 'braceArray',
        label: 'Array initializer braces',
        group: 'Braces',
        kind: 'enum',
        ids: [P + 'brace_position_for_array_initializer'],
        choices: [
            { value: 'end_of_line', label: 'Same line' },
            { value: 'next_line', label: 'Next line' },
        ],
        defaultValue: 'end_of_line',
    },
    {
        key: 'spaceControlParen',
        label: 'Space before ( in if / for / while / switch / catch',
        group: 'Spacing',
        kind: 'bool',
        ids: [
            P + 'insert_space_before_opening_paren_in_if',
            P + 'insert_space_before_opening_paren_in_for',
            P + 'insert_space_before_opening_paren_in_while',
            P + 'insert_space_before_opening_paren_in_switch',
            P + 'insert_space_before_opening_paren_in_catch',
        ],
        onValue: 'insert',
        offValue: 'do not insert',
        defaultValue: 'insert',
    },
    {
        key: 'spaceAfterComma',
        label: 'Space after comma',
        group: 'Spacing',
        kind: 'bool',
        ids: [
            P + 'insert_space_after_comma_in_method_invocation_arguments',
            P + 'insert_space_after_comma_in_method_declaration_parameters',
            P + 'insert_space_after_comma_in_constructor_declaration_parameters',
            P + 'insert_space_after_comma_in_for_inits',
        ],
        onValue: 'insert',
        offValue: 'do not insert',
        defaultValue: 'insert',
    },
    {
        key: 'spaceAssignment',
        label: 'Spaces around =',
        group: 'Spacing',
        kind: 'bool',
        ids: [P + 'insert_space_before_assignment_operator', P + 'insert_space_after_assignment_operator'],
        onValue: 'insert',
        offValue: 'do not insert',
        defaultValue: 'insert',
    },
    {
        key: 'lineSplit',
        label: 'Maximum line width',
        group: 'Line width',
        kind: 'int',
        ids: [P + 'lineSplit'],
        min: 40,
        max: 400,
        defaultValue: '120',
    },
];

/** Sample used for the live preview; exercises braces, spacing, indent and wrapping. */
export const FORMAT_PREVIEW_SAMPLE = [
    'package preview;',
    '',
    'import java.util.List;',
    '',
    'public class OrderService {',
    '	private static final int MAX_ORDERS = 100;',
    '',
    '	public int sum(List<Integer> values, String name) {',
    '		int total = 0;',
    '		for (int i = 0; i < values.size(); i++) {',
    '			if (values.get(i) != null) {',
    '							total = total + values.get(i);',
    '			}',
    '		}',
    '		String message = "Hello " + name + ", you have " + total + " points that will expire soon unless you use them";',
    '		return total;',
    '	}',
    '}',
    '',
].join('\n');

/** JSP sample for the JSP formatter preview; exercises directives, nesting, wrapping and scriptlets. */
export const JSP_FORMAT_PREVIEW_SAMPLE = [
    '<%@ page language="java" contentType="text/html" %>',
    '<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>',
    '<html>',
    '<head>',
    '<title>${pageTitle}</title>',
    '</head>',
    '<body>',
    '<h1>Users</h1>',
    '<c:forEach items="${users}" var="user">',
    '<div class="user-card ${user.active ? \'active\' : \'inactive\'}" data-role="main panel" id="userPanel">',
    '<p>${user.name} — ${user.email}</p>',
    '</div>',
    '</c:forEach>',
    '<%',
    'String footer = "Generated by JavaScope";',
    'int year = 2026;',
    'if (year > 2000) {',
    'footer += " (" + year + ")";',
    '}',
    '%>',
    '<footer><%=year%> · ${appName}</footer>',
    '</body>',
    '</html>',
    '',
].join('\n');

export interface ParsedFormatterProfile {
    name: string;
    kind: string;
    version: string;
    /** Everything before the first <setting> (XML prolog, <profiles>, <profile ...>). */
    prefix: string;
    /** Everything after the last setting (</profile>, </profiles>). */
    suffix: string;
    /** Setting id -> value, in document order. */
    settings: Map<string, string>;
}

const SETTING_RE = /<setting\s+id="([^"]*)"\s+value="([^"]*)"\s*\/>/g;

export function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function unescapeXml(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

/** Parses a CodeFormatterProfile XML, preserving everything around the settings. */
export function parseFormatterProfile(xml: string): ParsedFormatterProfile {
    const settings = new Map<string, string>();
    let first = -1;
    let lastEnd = -1;
    SETTING_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SETTING_RE.exec(xml)) !== null) {
        if (first === -1) {
            first = m.index;
        }
        settings.set(unescapeXml(m[1]), unescapeXml(m[2]));
        lastEnd = SETTING_RE.lastIndex;
    }
    if (first === -1) {
        throw new Error('no <setting> elements found in formatter profile');
    }
    const profileTag = xml.slice(0, first).match(/<profile\s+[^>]*>/);
    const name = profileTag?.[0].match(/\bname="([^"]*)"/)?.[1] ?? 'JavaScope';
    const kind = profileTag?.[0].match(/\bkind="([^"]*)"/)?.[1] ?? 'CodeFormatterProfile';
    const version = profileTag?.[0].match(/\bversion="([^"]*)"/)?.[1] ?? '21';
    const newline = xml.includes('\r\n') ? '\r\n' : '\n';
    return {
        name: unescapeXml(name),
        kind,
        version,
        prefix: xml.slice(0, first),
        suffix: xml.slice(lastEnd),
        settings,
    };
}

/** Serializes back to profile XML, preserving the original prolog/epilog. */
export function serializeFormatterProfile(parsed: ParsedFormatterProfile): string {
    const newline = parsed.prefix.includes('\r\n') ? '\r\n' : '\n';
    const lines: string[] = [];
    for (const [id, value] of parsed.settings.entries()) {
        lines.push(`<setting id="${escapeXml(id)}" value="${escapeXml(value)}"/>`);
    }
    return parsed.prefix + lines.join(newline) + parsed.suffix;
}

/**
 * Returns a new XML string with the given overrides applied. Existing ids keep
 * their position; unknown ids are appended before the epilog (JDT ignores ids
 * it does not know, so this is safe).
 */
export function applyFormatterOverrides(xml: string, overrides: Record<string, string>): string {
    const parsed = parseFormatterProfile(xml);
    for (const [id, value] of Object.entries(overrides)) {
        parsed.settings.set(id, value);
    }
    return serializeFormatterProfile(parsed);
}

/** Flattens a form values map (def.key -> value) into Eclipse id -> value. */
export function flattenOptionValues(values: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const def of FORMATTER_OPTION_DEFS) {
        const value = values[def.key] ?? def.defaultValue;
        for (const id of def.ids) {
            out[id] = value;
        }
    }
    return out;
}

/** Reads the current value of a def from a parsed settings map (first id wins). */
export function readOptionValue(def: FormatterOptionDef, settings: Map<string, string>): string {
    for (const id of def.ids) {
        const value = settings.get(id);
        if (value !== undefined) {
            return value;
        }
    }
    return def.defaultValue;
}
