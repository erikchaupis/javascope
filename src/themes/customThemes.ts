import * as fs from 'fs';
import * as path from 'path';
import {
    buildTextMateRules,
    JavaScopeTheme,
    SemanticTokenStyle,
    ThemeColorSlots,
    ThemeType,
} from './builtinThemes';

export interface CustomThemeFile {
    name?: string;
    type?: ThemeType;
    colors?: Partial<ThemeColorSlots>;
    textMateRules?: Array<{ scope: string | string[]; settings: { foreground?: string; fontStyle?: string } }>;
    semanticRules?: Record<string, SemanticTokenStyle>;
}

export interface LoadedCustomTheme {
    id: string;
    name: string;
    type: ThemeType;
    theme: JavaScopeTheme;
    sourcePath: string;
    origin: 'user' | 'workspace';
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const LIGHT_FALLBACK: ThemeColorSlots = {
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
};

const DARK_FALLBACK: ThemeColorSlots = {
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
};

export function validateCustomTheme(doc: unknown): string[] {
    const problems: string[] = [];
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
        problems.push('theme file must contain a JSON object');
        return problems;
    }
    const o = doc as CustomThemeFile;
    if (o.name !== undefined && (typeof o.name !== 'string' || o.name.trim().length === 0)) {
        problems.push('"name" must be a non-empty string');
    }
    if (o.type !== undefined && o.type !== 'light' && o.type !== 'dark') {
        problems.push('"type" must be "light" or "dark"');
    }
    if (o.colors !== undefined) {
        if (typeof o.colors !== 'object' || o.colors === null) {
            problems.push('"colors" must be an object');
        } else {
            for (const [key, value] of Object.entries(o.colors)) {
                if (typeof value !== 'string' || !HEX_RE.test(value)) {
                    problems.push(`"colors.${key}" must be a hex color like "#7F0055"`);
                }
            }
        }
    }
    if (o.semanticRules !== undefined) {
        if (typeof o.semanticRules !== 'object' || o.semanticRules === null) {
            problems.push('"semanticRules" must be an object');
        } else {
            for (const [key, value] of Object.entries(o.semanticRules)) {
                if (typeof value === 'string') {
                    if (!HEX_RE.test(value)) {
                        problems.push(`"semanticRules.${key}" must be a hex color like "#7F0055"`);
                    }
                } else if (typeof value === 'object' && value !== null) {
                    const style = value as { foreground?: unknown; fontStyle?: unknown };
                    const keys = Object.keys(style);
                    if (keys.some((k) => k !== 'foreground' && k !== 'fontStyle')) {
                        problems.push(`"semanticRules.${key}" only allows "foreground" and "fontStyle"`);
                    }
                    if (style.foreground !== undefined && (typeof style.foreground !== 'string' || !HEX_RE.test(style.foreground))) {
                        problems.push(`"semanticRules.${key}.foreground" must be a hex color like "#7F0055"`);
                    }
                    if (style.fontStyle !== undefined && typeof style.fontStyle !== 'string') {
                        problems.push(`"semanticRules.${key}.fontStyle" must be a string like "italic"`);
                    }
                } else {
                    problems.push(`"semanticRules.${key}" must be a hex color or an object with foreground/fontStyle`);
                }
            }
        }
    }
    if (o.textMateRules !== undefined) {
        if (!Array.isArray(o.textMateRules)) {
            problems.push('"textMateRules" must be an array');
        }
    }
    return problems;
}

function loadOne(filePath: string, origin: 'user' | 'workspace'): LoadedCustomTheme {
    const raw = fs.readFileSync(filePath, 'utf8');
    let doc: unknown;
    try {
        doc = JSON.parse(raw);
    } catch (e) {
        throw new Error(`invalid JSON in ${filePath}: ${(e as Error).message}`);
    }
    const problems = validateCustomTheme(doc);
    if (problems.length > 0) {
        throw new Error(`invalid theme ${filePath}:\n- ${problems.join('\n- ')}`);
    }
    const file = doc as CustomThemeFile;
    const type = file.type ?? 'dark';
    const base = type === 'dark' ? DARK_FALLBACK : LIGHT_FALLBACK;
    const colors: ThemeColorSlots = { ...base, ...(file.colors ?? {}) };
    const fileName = path.basename(filePath, '.json');
    const id = `custom:${origin}:${fileName}`;
    const name = file.name ?? fileName;
    const theme: JavaScopeTheme = {
        id,
        name,
        type,
        colors,
        extraTextMateRules: file.textMateRules,
        semanticRules: file.semanticRules,
    };
    return { id, name, type, theme, sourcePath: filePath, origin };
}

/** Discovers custom themes in `themes/` under both config directories. */
export function discoverCustomThemes(dirs: Array<{ dir: string; origin: 'user' | 'workspace' }>): {
    themes: LoadedCustomTheme[];
    errors: Array<{ path: string; error: string }>;
} {
    const themes: LoadedCustomTheme[] = [];
    const errors: Array<{ path: string; error: string }> = [];
    for (const { dir, origin } of dirs) {
        const themesDir = path.join(dir, 'themes');
        if (!fs.existsSync(themesDir)) {
            continue;
        }
        for (const file of fs.readdirSync(themesDir).sort()) {
            if (!file.endsWith('.json')) {
                continue;
            }
            const filePath = path.join(themesDir, file);
            try {
                themes.push(loadOne(filePath, origin));
            } catch (e) {
                errors.push({ path: filePath, error: (e as Error).message });
            }
        }
    }
    return { themes, errors };
}

/** Expands a (builtin or custom) theme into the concrete rule blocks applied to VS Code. */
export function resolveThemeRules(
    theme: JavaScopeTheme,
    options?: { jspTemplates?: boolean },
): {
    textMateRules: Array<{ scope: string | string[]; settings: { foreground?: string; fontStyle?: string } }>;
    semanticRules: Record<string, SemanticTokenStyle>;
} {
    return {
        textMateRules: buildTextMateRules(theme, options),
        semanticRules: theme.semanticRules ?? {},
    };
}
