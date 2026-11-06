import * as fs from 'fs';
import * as path from 'path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { BUILTIN_JSP_PROFILE, JspFormatterProfile, normalizeJspProfile, validateJspProfile, JspProfileFile } from './jsp/profile';

export type ProfileKind = 'java' | 'jsp';
export type ProfileOrigin = 'builtin' | 'user' | 'workspace';

export interface FormatterProfile {
    id: string;
    name: string;
    kind: ProfileKind;
    origin: ProfileOrigin;
    /** Absolute path for file-backed profiles; undefined for built-ins. */
    path?: string;
    /** Built-in profiles only. */
    builtin?: boolean;
}

export interface ProfileWithContent<T> extends FormatterProfile {
    content: T;
}

export interface ProfileManagerOptions {
    userConfigDir: string;
    workspaceConfigDir?: string | null;
    /** Directory holding the built-in default.xml Java profile. */
    builtinJavaProfilePath: string;
    /** Directory holding the built-in default.json JSP profile (optional; falls back to embedded). */
    builtinJspProfilePath?: string;
}

export interface JavaProfileXml {
    /** settings id -> value */
    settings: Map<string, string>;
    profileName: string;
}

const JAVA_PROFILE_EXT = '.xml';
const JSP_PROFILE_EXT = '.json';

/**
 * Discovers, validates and manages formatter profiles in the user and
 * workspace `.javascope/formatters` directories. Workspace profiles override
 * user profiles with the same identifier. Built-in profiles are read-only.
 */
export class ProfileManager {
    readonly options: ProfileManagerOptions;

    constructor(options: ProfileManagerOptions) {
        this.options = options;
    }

    /** Built-in JSP profile: read from disk when available, else embedded. */
    private builtinJspProfile(): JspFormatterProfile {
        const filePath = this.options.builtinJspProfilePath;
        if (filePath && fs.existsSync(filePath)) {
            try {
                const doc = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
                if (validateJspProfile(doc).length === 0) {
                    return normalizeJspProfile(doc as JspProfileFile, 'builtin:jsp:default');
                }
            } catch {
                // fall through to embedded profile
            }
        }
        return BUILTIN_JSP_PROFILE;
    }

    private profilesDir(origin: 'user' | 'workspace', kind: ProfileKind): string {
        const base = origin === 'user' ? this.options.userConfigDir : (this.options.workspaceConfigDir as string);
        return path.join(base, 'formatters', kind);
    }

    private ext(kind: ProfileKind): string {
        return kind === 'java' ? JAVA_PROFILE_EXT : JSP_PROFILE_EXT;
    }

    private idFor(origin: Exclude<ProfileOrigin, 'builtin'>, kind: ProfileKind, fileName: string): string {
        return `${origin}:${kind}:${fileName.substring(0, fileName.length - this.ext(kind).length)}`;
    }

    private fileNameFromId(id: string): { origin: Exclude<ProfileOrigin, 'builtin'>; kind: ProfileKind; name: string } | null {
        const parts = id.split(':');
        if (parts.length !== 3) {
            return null;
        }
        const [origin, kind, name] = parts as [string, string, string];
        if ((origin !== 'user' && origin !== 'workspace') || (kind !== 'java' && kind !== 'jsp') || !name) {
            return null;
        }
        return { origin: origin as 'user' | 'workspace', kind: kind as ProfileKind, name };
    }

    /** Lists all profiles. Workspace overrides user with the same file name. */
    listProfiles(kind: ProfileKind): FormatterProfile[] {
        const result: FormatterProfile[] = [];
        const seenUser = new Map<string, FormatterProfile>();

        if (kind === 'java') {
            result.push({
                id: 'builtin:java:eclipse-default',
                name: 'Eclipse [built-in]',
                kind,
                origin: 'builtin',
                builtin: true,
                path: this.options.builtinJavaProfilePath,
            });
        } else {
            result.push({
                id: 'builtin:jsp:default',
                name: this.builtinJspProfile().name,
                kind,
                origin: 'builtin',
                builtin: true,
            });
        }

        for (const origin of ['user', 'workspace'] as const) {
            const dir = this.options.workspaceConfigDir || origin === 'user' ? this.profilesDir(origin, kind) : undefined;
            if (!dir || !fs.existsSync(dir)) {
                continue;
            }
            for (const file of fs.readdirSync(dir).sort()) {
                if (!file.endsWith(this.ext(kind))) {
                    continue;
                }
                const filePath = path.join(dir, file);
                const id = this.idFor(origin, kind, file);
                const profile: FormatterProfile = { id, name: fileNameToName(file, this.ext(kind)), kind, origin, path: filePath };
                if (origin === 'workspace') {
                    // Workspace overrides user profile with the same name.
                    const userPeer = seenUser.get(file);
                    if (userPeer) {
                        result.splice(result.indexOf(userPeer), 1);
                    }
                    result.push(profile);
                } else {
                    seenUser.set(file, profile);
                    result.push(profile);
                }
            }
        }
        return result;
    }

    getProfile(id: string): FormatterProfile | null {
        if (id === 'builtin:java:eclipse-default') {
            return {
                id,
                name: 'Eclipse [built-in]',
                kind: 'java',
                origin: 'builtin',
                builtin: true,
                path: this.options.builtinJavaProfilePath,
            };
        }
        if (id === 'builtin:jsp:default') {
            return { id, name: this.builtinJspProfile().name, kind: 'jsp', origin: 'builtin', builtin: true };
        }
        const parsed = this.fileNameFromId(id);
        if (!parsed) {
            return null;
        }
        const dir = this.profilesDir(parsed.origin, parsed.kind);
        const filePath = path.join(dir, parsed.name + this.ext(parsed.kind));
        if (!fs.existsSync(filePath)) {
            return null;
        }
        return {
            id,
            name: parsed.name,
            kind: parsed.kind,
            origin: parsed.origin,
            path: filePath,
        };
    }

    /** Reads and validates profile content. Throws Error with a clear message on invalid profiles. */
    async getProfileContent(id: string): Promise<ProfileWithContent<unknown>> {
        const profile = this.getProfile(id);
        if (!profile) {
            throw new Error(`profile not found: ${id}`);
        }
        if (id === 'builtin:jsp:default') {
            return { ...profile, content: this.builtinJspProfile() };
        }
        if (profile.kind === 'java') {
            const xml = fs.readFileSync(profile.path as string, 'utf8');
            const parsed = parseJavaProfileXml(xml, profile.path as string);
            return { ...profile, content: parsed };
        }
        const json = fs.readFileSync(profile.path as string, 'utf8');
        let doc: unknown;
        try {
            doc = JSON.parse(json);
        } catch (e) {
            throw new Error(`invalid JSON in ${profile.path}: ${(e as Error).message}`);
        }
        const problems = validateJspProfile(doc);
        if (problems.length > 0) {
            throw new Error(`invalid JSP profile ${profile.path}:\n- ${problems.join('\n- ')}`);
        }
        return { ...profile, content: normalizeJspProfile(doc as JspProfileFile, id) };
    }

    async getJspProfile(id: string): Promise<JspFormatterProfile> {
        const withContent = await this.getProfileContent(id);
        if (withContent.kind !== 'jsp') {
            throw new Error(`profile ${id} is not a JSP profile`);
        }
        return withContent.content as JspFormatterProfile;
    }

    /**
     * Creates a new profile at the target origin, optionally duplicating an
     * existing profile's content. Returns the new profile id.
     */
    async createProfile(input: {
        kind: ProfileKind;
        name: string;
        origin: 'user' | 'workspace';
        duplicateFrom?: string;
    }): Promise<string> {
        const fileName = sanitizeFileName(input.name);
        if (!fileName) {
            throw new Error(`invalid profile name: ${input.name}`);
        }
        const dir = this.profilesDir(input.origin, input.kind);
        fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, fileName + this.ext(input.kind));
        if (fs.existsSync(filePath)) {
            throw new Error(`a ${input.kind} profile named '${input.name}' already exists in ${input.origin} configuration`);
        }

        let content: string;
        if (input.duplicateFrom) {
            const source = await this.getProfileContent(input.duplicateFrom);
            if (source.kind !== input.kind) {
                throw new Error('cannot duplicate a profile of a different kind');
            }
            content = this.serializeForKind(input.kind, source, input.name);
        } else if (input.kind === 'java') {
            const builtIn = fs.readFileSync(this.options.builtinJavaProfilePath, 'utf8');
            content = renameJavaProfile(builtIn, input.name);
        } else {
            const doc: JspProfileFile = { name: input.name, ...JSON.parse(JSON.stringify(this.builtinJspProfile())) };
            delete doc.id;
            doc.name = input.name;
            content = JSON.stringify(doc, null, 2) + '\n';
        }
        fs.writeFileSync(filePath, content, 'utf8');
        return this.idFor(input.origin, input.kind, fileName + this.ext(input.kind));
    }

    async renameProfile(id: string, newName: string): Promise<string> {
        const profile = this.getProfile(id);
        if (!profile) {
            throw new Error(`profile not found: ${id}`);
        }
        this.assertWritable(profile);
        const parsed = this.fileNameFromId(id);
        if (!parsed) {
            throw new Error(`cannot rename built-in profile ${id}`);
        }
        const newFileName = sanitizeFileName(newName);
        if (!newFileName) {
            throw new Error(`invalid profile name: ${newName}`);
        }
        const dir = this.profilesDir(parsed.origin, parsed.kind);
        const newPath = path.join(dir, newFileName + this.ext(parsed.kind));
        if (newPath !== profile.path && fs.existsSync(newPath)) {
            throw new Error(`a profile named '${newName}' already exists`);
        }
        const raw = fs.readFileSync(profile.path as string, 'utf8');
        const updated =
            parsed.kind === 'java'
                ? renameJavaProfile(raw, newName)
                : renameJspProfile(raw, newName);
        fs.writeFileSync(newPath, updated, 'utf8');
        if (newPath !== profile.path) {
            fs.unlinkSync(profile.path as string);
        }
        return this.idFor(parsed.origin, parsed.kind, newFileName + this.ext(parsed.kind));
    }

    async updateProfileContent(id: string, content: unknown): Promise<void> {
        const profile = this.getProfile(id);
        if (!profile) {
            throw new Error(`profile not found: ${id}`);
        }
        this.assertWritable(profile);
        if (profile.kind === 'java') {
            if (typeof content !== 'string') {
                throw new Error('Java profile content must be the profile XML as a string');
            }
            // Validate before writing.
            parseJavaProfileXml(content, profile.path as string);
            fs.writeFileSync(profile.path as string, content, 'utf8');
        } else {
            const problems = validateJspProfile(content);
            if (problems.length > 0) {
                throw new Error(`invalid JSP profile:\n- ${problems.join('\n- ')}`);
            }
            const normalized = normalizeJspProfile(content as JspProfileFile, id);
            fs.writeFileSync(profile.path as string, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
        }
    }

    deleteProfile(id: string): void {
        const profile = this.getProfile(id);
        if (!profile) {
            throw new Error(`profile not found: ${id}`);
        }
        this.assertWritable(profile);
        fs.unlinkSync(profile.path as string);
    }

    async importProfile(input: {
        kind: ProfileKind;
        sourcePath: string;
        origin: 'user' | 'workspace';
        name?: string;
    }): Promise<string> {
        const src = path.resolve(input.sourcePath);
        if (!fs.existsSync(src)) {
            throw new Error(`import source not found: ${src}`);
        }
        const ext = this.ext(input.kind);
        if (!src.endsWith(ext)) {
            throw new Error(`imported ${input.kind} profiles must be ${ext} files`);
        }
        const raw = fs.readFileSync(src, 'utf8');
        const displayName = input.name ?? fileNameToName(path.basename(src), ext);
        if (input.kind === 'java') {
            parseJavaProfileXml(raw, src);
        } else {
            let doc: unknown;
            try {
                doc = JSON.parse(raw);
            } catch (e) {
                throw new Error(`invalid JSON in ${src}: ${(e as Error).message}`);
            }
            const problems = validateJspProfile(doc);
            if (problems.length > 0) {
                throw new Error(`invalid JSP profile in ${src}:\n- ${problems.join('\n- ')}`);
            }
        }
        const fileName = sanitizeFileName(displayName);
        const dir = this.profilesDir(input.origin, input.kind);
        fs.mkdirSync(dir, { recursive: true });
        const dest = path.join(dir, fileName + ext);
        if (fs.existsSync(dest)) {
            throw new Error(`a ${input.kind} profile named '${displayName}' already exists in ${input.origin} configuration`);
        }
        fs.copyFileSync(src, dest);
        return this.idFor(input.origin, input.kind, fileName + ext);
    }

    async exportProfile(id: string, destPath: string): Promise<string> {
        const profile = this.getProfile(id);
        if (!profile) {
            throw new Error(`profile not found: ${id}`);
        }
        let content: string;
        if (id === 'builtin:jsp:default') {
            content = JSON.stringify(this.builtinJspProfile(), null, 2) + '\n';
        } else {
            content = fs.readFileSync(profile.path as string, 'utf8');
        }
        const dest = path.resolve(destPath);
        fs.writeFileSync(dest, content, 'utf8');
        return dest;
    }

    private serializeForKind(kind: ProfileKind, source: ProfileWithContent<unknown>, newName: string): string {
        if (kind === 'java') {
            const raw = fs.readFileSync(source.path as string, 'utf8');
            return renameJavaProfile(raw, newName);
        }
        const doc = JSON.parse(JSON.stringify(source.content)) as JspProfileFile;
        doc.name = newName;
        delete doc.id;
        return JSON.stringify(doc, null, 2) + '\n';
    }

    private assertWritable(profile: FormatterProfile): void {
        if (profile.builtin) {
            throw new Error(`built-in profile '${profile.name}' is read-only; duplicate it to create an editable copy`);
        }
    }
}

function sanitizeFileName(name: string): string {
    return name
        .trim()
        .replace(/\.(xml|json)$/i, '')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function fileNameToName(file: string, ext: string): string {
    return file.substring(0, file.length - ext.length);
}

/** Validates and extracts settings from an Eclipse CodeFormatterProfile XML. */
export function parseJavaProfileXml(xml: string, sourceName: string): JavaProfileXml {
    const validation = XMLValidator.validate(xml, {
        allowBooleanAttributes: true,
    });
    if (validation !== true) {
        throw new Error(
            `invalid XML in ${sourceName}: ${validation.err.msg} (line ${validation.err.line}, col ${validation.err.col})`,
        );
    }
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => name === 'profile' || name === 'setting',
    });
    const doc = parser.parse(xml) as {
        profiles?:
            | { profile?: Array<{ '@_kind'?: string; '@_name'?: string; setting?: Array<{ '@_id'?: string; '@_value'?: string }> }> }
            | Array<{ profile?: Array<{ '@_kind'?: string; '@_name'?: string; setting?: Array<{ '@_id'?: string; '@_value'?: string }> }> }>;
    };
    const root = Array.isArray(doc?.profiles) ? doc?.profiles?.[0] : doc?.profiles;
    const profiles = root?.profile;
    if (!profiles || profiles.length === 0) {
        throw new Error(`no <profile> element found in ${sourceName}`);
    }
    const profile = profiles.find((p) => p['@_kind'] === 'CodeFormatterProfile') ?? profiles[0];
    const settings = new Map<string, string>();
    for (const s of profile.setting ?? []) {
        if (s['@_id']) {
            settings.set(s['@_id'], s['@_value'] ?? '');
        }
    }
    if (settings.size === 0) {
        throw new Error(`profile '${profile['@_name'] ?? '(unnamed)'}' in ${sourceName} contains no settings`);
    }
    return { settings, profileName: profile['@_name'] ?? 'unnamed' };
}

function renameJavaProfile(xml: string, newName: string): string {
    return xml.replace(/(<profile\b[^>]*\bname=")[^"]*(")/, `$1${newName.replace(/"/g, '&quot;')}$2`);
}

function renameJspProfile(raw: string, newName: string): string {
    const doc = JSON.parse(raw) as JspProfileFile;
    doc.name = newName;
    return JSON.stringify(doc, null, 2) + '\n';
}
