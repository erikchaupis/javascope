/**
 * Built-in editor color schemes. These define editor token colors only
 * (TextMate rules + semantic token rules scoped to Java/JSP); the workbench
 * UI theme is left entirely to the user.
 *
 * Palettes follow the published defaults of the corresponding IDEs as
 * closely as possible.
 */

export type ThemeType = 'light' | 'dark';

export interface ThemeColorSlots {
    foreground: string;
    keyword: string;
    string: string;
    stringEscape: string;
    number: string;
    comment: string;
    javadoc: string;
    javadocTag: string;
    className: string;
    interfaceName: string;
    enumName: string;
    annotation: string;
    methodDeclaration: string;
    methodCall: string;
    field: string;
    staticField: string;
    parameter: string;
    localVariable: string;
    operator: string;
    punctuation: string;
    /**
     * JSP template palette (applied only when themes.jspTemplates is on).
     * Eclipse schemes ship one; other schemes (e.g. IntelliJ) deliberately
     * omit it and users may add it via a custom theme's colors.
     */
    htmlTag?: string;
    htmlAttribute?: string;
    htmlString?: string;
    elExpression?: string;
}

export interface TextMateRule {
    scope: string | string[];
    settings: { foreground?: string; fontStyle?: string };
}

/** Semantic token rule: a plain color string or an object with style. */
export type SemanticTokenStyle = string | { foreground?: string; fontStyle?: string };

export interface JavaScopeTheme {
    id: string;
    name: string;
    type: ThemeType;
    /** Base palette expanded into TextMate + semantic rules. */
    colors: ThemeColorSlots;
    /** Extra rules appended verbatim. */
    extraTextMateRules?: TextMateRule[];
    /** Semantic token type -> color, or -> { foreground, fontStyle }. Selectors may include modifiers ("property.static"). */
    semanticRules?: Record<string, SemanticTokenStyle>;
}

export const BUILTIN_THEMES: JavaScopeTheme[] = [
    {
        id: 'eclipse-light',
        name: 'Eclipse Light',
        type: 'light',
        colors: {
            foreground: '#000000',
            keyword: '#7F0055',
            string: '#2A00FF',
            stringEscape: '#2A00FF',
            number: '#000000',
            comment: '#3F7F5F',
            javadoc: '#3F5FBF',
            javadocTag: '#7F9FBF',
            className: '#000000',
            interfaceName: '#000000',
            enumName: '#000000',
            annotation: '#646464',
            methodDeclaration: '#000000',
            methodCall: '#000000',
            // Eclipse semantic defaults (eclipse.jdt.ui SemanticHighlightings):
            // fields #0000C0 and local variables #6A3E3E are enabled by
            // default; classes, parameters, numbers and methods stay black.
            field: '#0000C0',
            staticField: '#0000C0',
            parameter: '#000000',
            localVariable: '#6A3E3E',
            operator: '#000000',
            punctuation: '#000000',
            // Eclipse HTML/JSP editor palette (pixel-verified against the IDE:
            // tag & directive names, attribute names, values, EL).
            htmlTag: '#3F7F7F',
            htmlAttribute: '#800080',
            htmlString: '#2A00FF',
            elExpression: '#000000',
        },
        semanticRules: {
            class: '#000000',
            interface: '#000000',
            enum: '#000000',
            type: '#000000',
            typeParameter: '#000000',
            namespace: '#000000',
            annotation: '#646464',
            decorator: '#646464',
            method: '#000000',
            modifier: { foreground: '#7F0055', fontStyle: 'bold' },
            // Primitives (int, void, …) arrive as semantic "keyword" tokens
            // (jdt.ls maps PrimitiveType → KEYWORD); keep them keyword-colored.
            keyword: { foreground: '#7F0055', fontStyle: 'bold' },
            // Eclipse semantic defaults: fields blue; constants (static
            // final) bold + italic; plain static fields italic only. The
            // language server emits "readonly" for final fields, so the
            // distinction is exact.
            property: '#0000C0',
            'property.readonly': '#0000C0',
            'property.static': { foreground: '#0000C0', fontStyle: 'italic' },
            'property.static.readonly': { foreground: '#0000C0', fontStyle: 'bold italic' },
            variable: '#6A3E3E',
            'variable.static': { foreground: '#0000C0', fontStyle: 'italic' },
            'variable.static.readonly': { foreground: '#0000C0', fontStyle: 'bold italic' },
            parameter: '#000000',
            enumMember: { foreground: '#0000C0', fontStyle: 'bold italic' },
        },
    },
    {
        id: 'eclipse-dark',
        name: 'Eclipse Dark',
        type: 'dark',
        colors: {
            foreground: '#BFBFBF',
            keyword: '#D78D3A',
            string: '#17A6A6',
            stringEscape: '#17A6A6',
            number: '#7FB347',
            comment: '#75787B',
            javadoc: '#5C8198',
            javadocTag: '#7293A5',
            className: '#93CDB0',
            interfaceName: '#93CDB0',
            enumName: '#93CDB0',
            annotation: '#A5A5A5',
            methodDeclaration: '#BED6FF',
            methodCall: '#BED6FF',
            field: '#BFBFBF',
            staticField: '#BDAE9C',
            parameter: '#BFBFBF',
            localVariable: '#BFBFBF',
            operator: '#BFBFBF',
            punctuation: '#BFBFBF',
            // Eclipse keeps the same JSP template palette on dark themes.
            htmlTag: '#3F7F7F',
            htmlAttribute: '#800080',
            htmlString: '#2A00FF',
            elExpression: '#3F7F7F',
        },
        semanticRules: {
            class: '#93CDB0',
            interface: '#93CDB0',
            enum: '#93CDB0',
            annotation: '#A5A5A5',
            method: '#BED6FF',
            keyword: '#D78D3A',
            property: '#BFBFBF',
            variable: '#BFBFBF',
            parameter: '#BFBFBF',
            enumMember: '#BDAE9C',
        },
    },
    {
        id: 'intellij-light',
        name: 'IntelliJ Light',
        type: 'light',
        colors: {
            foreground: '#000000',
            keyword: '#000080',
            string: '#008000',
            stringEscape: '#000080',
            number: '#0000FF',
            comment: '#808080',
            javadoc: '#808080',
            javadocTag: '#8C8C8C',
            className: '#000000',
            interfaceName: '#000000',
            enumName: '#000000',
            annotation: '#808000',
            methodDeclaration: '#000000',
            methodCall: '#000000',
            field: '#660E7A',
            staticField: '#660E7A',
            parameter: '#000000',
            localVariable: '#000000',
            operator: '#000000',
            punctuation: '#000000',
        },
        extraTextMateRules: [
            {
                scope: ['meta.method.java entity.name.function.java'],
                settings: { foreground: '#000000', fontStyle: 'bold' },
            },
        ],
        semanticRules: {
            class: '#000000',
            interface: '#000000',
            enum: '#000000',
            annotation: '#808000',
            method: '#000000',
            keyword: '#000080',
            property: '#660E7A',
            variable: '#000000',
            parameter: '#000000',
            enumMember: '#660E7A',
        },
    },
    {
        id: 'intellij-darcula',
        name: 'IntelliJ Darcula',
        type: 'dark',
        colors: {
            foreground: '#A9B7C6',
            keyword: '#CC7832',
            string: '#6A8759',
            stringEscape: '#CC7832',
            number: '#6897BB',
            comment: '#808080',
            javadoc: '#629755',
            javadocTag: '#629755',
            className: '#A9B7C6',
            interfaceName: '#A9B7C6',
            enumName: '#A9B7C6',
            annotation: '#BBB529',
            methodDeclaration: '#FFC66D',
            methodCall: '#A9B7C6',
            field: '#9876AA',
            staticField: '#9876AA',
            parameter: '#A9B7C6',
            localVariable: '#A9B7C6',
            operator: '#A9B7C6',
            punctuation: '#A9B7C6',
        },
        extraTextMateRules: [
            {
                scope: ['meta.method.java entity.name.function.java'],
                settings: { foreground: '#FFC66D' },
            },
        ],
        semanticRules: {
            class: '#A9B7C6',
            interface: '#A9B7C6',
            enum: '#A9B7C6',
            annotation: '#BBB529',
            method: '#FFC66D',
            keyword: '#CC7832',
            property: '#9876AA',
            variable: '#A9B7C6',
            parameter: '#A9B7C6',
            enumMember: '#9876AA',
        },
    },
];

const KEYWORD_STYLE_BY_ID: Record<string, string> = {
    'eclipse-light': 'bold',
    'eclipse-dark': '',
    'intellij-light': '',
    'intellij-dark': '',
    'intellij-darcula': '',
};

const ITALIC_BY_ID: Record<string, string> = {
    'intellij-light': 'italic',
    'intellij-darcula': 'italic',
};

// Eclipse paints constants (static final fields) bold + italic and plain
// static fields italic (SemanticHighlightings defaults).
const CONSTANT_STYLE_BY_ID: Record<string, string> = {
    'eclipse-light': 'bold italic',
};

const JAVADOC_TAG_STYLE_BY_ID: Record<string, string> = {
    'eclipse-light': 'bold',
    'eclipse-dark': '',
    'intellij-light': 'italic',
    'intellij-darcula': 'italic',
};

// Selector bodies for the keyword group. In .java files the `source.java`
// root wins; inside JSP scriptlets VS Code scores the workbench theme's bare
// selectors higher because `source.java.embedded.jsp` sits deep in the stack —
// the `text.html.jsp`-rooted copy restores precedence there.
const KEYWORD_SELECTOR_BODIES = [
    'keyword.control',
    'keyword.other',
    'keyword.reserved',
    'keyword.module',
    'keyword.operator.instanceof',
    'storage.modifier',
    // Match the theme's exact primitive selector; the source.java prefix still
    // makes this compound selector more specific without leaking to other languages.
    'storage.type.primitive.java',
    'storage.type.local',
    'variable.language.this',
    'variable.language.java',
    'constant.language',
];

/**
 * Roots a TextMate selector at the Java grammar (`source.java <category>`).
 * The Java grammar scopes tokens as `<category>.<sub>.java`, so a suffix like
 * `keyword.control.java` never matches `keyword.control.try.java`; a
 * descendant selector rooted at `source.java` matches every sub-scope and
 * still cannot leak into other languages. Java embedded in JSP scriptlets is
 * covered too because the bundled JSP grammar includes `source.java`.
 */
function s(selector: string): string {
    return `source.java ${selector}`;
}

/**
 * Expands a palette into TextMate rules. Every selector is rooted at the
 * Java/JSP grammars so no other language is affected. With
 * `options.jspTemplates`, additionally paints the HTML template parts of
 * .jsp documents (see buildJspTemplateRules).
 */
export function buildTextMateRules(theme: JavaScopeTheme, options?: { jspTemplates?: boolean }): TextMateRule[] {
    const c = theme.colors;
    const keywordStyle = KEYWORD_STYLE_BY_ID[theme.id] ?? '';
    const fieldStyle = ITALIC_BY_ID[theme.id] ?? '';
    const constantStyle = [fieldStyle, CONSTANT_STYLE_BY_ID[theme.id] ?? ''].filter(Boolean).join(' ');
    const javadocTagStyle = JAVADOC_TAG_STYLE_BY_ID[theme.id] ?? '';

    const rules: TextMateRule[] = [
        // Keywords, modifiers, primitives (instanceof stays a keyword).
        {
            scope: [...KEYWORD_SELECTOR_BODIES.map(s), ...KEYWORD_SELECTOR_BODIES.map((b) => `text.html.jsp ${b}`)],
            settings: { foreground: c.keyword, fontStyle: keywordStyle },
        },
        // Reference types (class names in declarations, generics, new-expressions)
        // read as type names, not keywords — Eclipse keeps them uncolored.
        { scope: [s('storage.type.java'), s('storage.type.generic'), s('storage.type.generic.wildcard')], settings: { foreground: c.className } },
        // Package/import declarations read as plain text, like in Eclipse/IntelliJ.
        { scope: [s('storage.modifier.package'), s('storage.modifier.import'), s('variable.language.wildcard')], settings: { foreground: c.foreground } },
        // Types.
        { scope: [s('entity.name.type.class'), s('entity.name.type.record'), s('entity.other.inherited-class')], settings: { foreground: c.className } },
        { scope: [s('entity.name.type.interface'), s('entity.name.type')], settings: { foreground: c.interfaceName } },
        { scope: [s('entity.name.type.enum')], settings: { foreground: c.enumName } },
        { scope: [s('entity.name.type.annotation'), s('storage.type.annotation'), s('punctuation.definition.annotation')], settings: { foreground: c.annotation } },
        // Methods: declarations get the declaration color, plain calls the call color.
        { scope: [s('meta.method entity.name.function')], settings: { foreground: c.methodDeclaration } },
        { scope: [s('entity.name.function')], settings: { foreground: c.methodCall } },
        // Variables.
        { scope: [s('variable.parameter')], settings: { foreground: c.parameter } },
        { scope: [s('variable.other.constant'), s('constant.other.enum')], settings: { foreground: c.staticField, fontStyle: constantStyle } },
        { scope: [s('variable.other.field'), s('variable.other'), s('constant.other.key')], settings: { foreground: c.field } },
        // Declared names: the grammar scopes both field and local declarations
        // as variable.other.definition, so disambiguate by context — class body
        // (field) vs method body (local). Equal specificity: the later
        // (method/local) rule wins for locals inside methods.
        { scope: [s('meta.class meta.definition.variable variable.other.definition')], settings: { foreground: c.field } },
        { scope: [s('meta.method meta.definition.variable variable.other.definition')], settings: { foreground: c.localVariable } },
        // Locals declared in JSP scriptlets: no meta.method context there, so
        // without this they would fall into the field-colored catch-all.
        { scope: ['text.html.jsp meta.scriptlet.jsp meta.definition.variable variable.other.definition'], settings: { foreground: c.localVariable } },
        { scope: [s('variable')], settings: { foreground: c.localVariable } },
        // Literals.
        { scope: [s('string')], settings: { foreground: c.string } },
        { scope: [s('constant.character.escape')], settings: { foreground: c.stringEscape } },
        // Literals (null/true/false read as keywords, like in Eclipse).
        { scope: [s('constant.numeric')], settings: { foreground: c.number } },
        // Comments & documentation.
        { scope: [s('comment.line'), s('comment.block')], settings: { foreground: c.comment } },
        { scope: [s('comment.block.documentation'), s('comment.block.javadoc')], settings: { foreground: c.javadoc } },
        // Comment delimiters (//, /*, *, */) take the comment color, like Eclipse.
        { scope: [s('comment.line punctuation.definition.comment')], settings: { foreground: c.comment } },
        { scope: [s('comment.block punctuation.definition.comment')], settings: { foreground: c.comment } },
        { scope: [s('comment.block.documentation punctuation.definition.comment'), s('comment.block.javadoc punctuation.definition.comment')], settings: { foreground: c.javadoc } },
        { scope: [s('keyword.other.documentation'), s('meta.documentation.tag')], settings: { foreground: c.javadocTag, fontStyle: javadocTagStyle } },
        // Operators / punctuation (ternary and the lambda arrow read as operators).
        { scope: [s('keyword.operator'), s('keyword.control.ternary'), s('storage.type.function.arrow')], settings: { foreground: c.operator } },
        { scope: [s('punctuation'), s('storage.type.primitive.array'), s('storage.type.object.array')], settings: { foreground: c.punctuation } },
        // String quotes follow the string color.
        { scope: [s('punctuation.definition.string')], settings: { foreground: c.string } },
        // JSP constructs (scopes provided by JavaScope's bundled JSP grammar).
        {
            scope: [
                'punctuation.section.directive.jsp',
                'text.html.jsp punctuation.section.embedded.begin.jsp',
                'text.html.jsp punctuation.section.embedded.end.jsp',
                'punctuation.section.tag.jsp',
            ],
            settings: { foreground: c.keyword, fontStyle: theme.id === 'eclipse-light' ? '' : keywordStyle },
        },
        { scope: ['keyword.control.directive.jsp', 'entity.name.tag.directive.jsp'], settings: { foreground: c.keyword, fontStyle: keywordStyle } },
        { scope: ['comment.block.jsp'], settings: { foreground: c.comment } },
        { scope: ['punctuation.definition.expression.jsp'], settings: { foreground: c.keyword } },
        // Base foreground for Java/JSP documents.
        { scope: ['source.java'], settings: { foreground: c.foreground } },
        { scope: ['text.html.jsp', 'source.jsp'], settings: { foreground: c.foreground } },
    ];

    if (options?.jspTemplates) {
        rules.push(...buildJspTemplateRules(theme));
    }

    if (theme.extraTextMateRules) {
        rules.push(...theme.extraTextMateRules);
    }
    return rules;
}

/**
 * HTML-template palette for .jsp documents, in the spirit of the Eclipse HTML
 * editor: tag names (JSTL included) with their brackets, attribute names,
 * attribute values and EL expressions each get one tone; quoted strings inside
 * EL keep the string color. Every selector is
 * rooted at `text.html.jsp` so standalone .html files (and the user's HTML
 * theme) are never affected. Gated behind the `jspTemplates` option.
 */
export function buildJspTemplateRules(theme: JavaScopeTheme): TextMateRule[] {
    const c = theme.colors;
    // Schemes without an HTML palette (e.g. IntelliJ, which we deliberately
    // keep minimal) opt out; users can add one through a custom theme's
    // colors: htmlTag, htmlAttribute, htmlString, elExpression.
    if (!c.htmlTag || !c.htmlAttribute || !c.htmlString || !c.elExpression) {
        return [];
    }
    const j = (selector: string): string => `text.html.jsp ${selector}`;
    return [
        // ".html" suffix keeps JSP directive tag names (…directive.jsp) on the
        // keyword color from the base rules.
        { scope: [j('entity.name.tag.html'), j('punctuation.definition.tag')], settings: { foreground: c.htmlTag } },
        {
            scope: [j('entity.other.attribute-name')],
            settings: { foreground: c.htmlAttribute, fontStyle: theme.id === 'eclipse-light' ? 'italic' : '' },
        },
        { scope: [j('string.quoted.double'), j('string.quoted.single')], settings: { foreground: c.htmlString } },
        {
            scope: [
                j('meta.expression.jsp'),
                j('variable.other.el'),
                j('constant.language.el'),
                j('constant.numeric.el'),
                j('keyword.operator.el'),
                j('punctuation.definition.expression'),
            ],
            settings: { foreground: c.elExpression },
        },
    ];
}

export function getBuiltinTheme(id: string): JavaScopeTheme | null {
    return BUILTIN_THEMES.find((t) => t.id === id) ?? null;
}

/** Light/dark counterpart of a built-in scheme, for contrast mismatch hints. */
export function getCounterpartThemeId(id: string): string | null {
    const counterpart: Record<string, string> = {
        'eclipse-light': 'eclipse-dark',
        'eclipse-dark': 'eclipse-light',
        'intellij-light': 'intellij-darcula',
        'intellij-darcula': 'intellij-light',
    };
    return counterpart[id] ?? null;
}

/** Font styles for the preview's signature tokens (constants, keywords, javadoc tags). */
export function getThemePreviewStyles(theme: JavaScopeTheme): {
    keyword: string;
    constant: string;
    javadocTag: string;
} {
    const fieldStyle = ITALIC_BY_ID[theme.id] ?? '';
    return {
        keyword: KEYWORD_STYLE_BY_ID[theme.id] ?? '',
        constant: [fieldStyle, CONSTANT_STYLE_BY_ID[theme.id] ?? ''].filter(Boolean).join(' '),
        javadocTag: JAVADOC_TAG_STYLE_BY_ID[theme.id] ?? '',
    };
}
