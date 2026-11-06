import React, { useEffect, useMemo, useRef, useState } from 'react';

const vscode = acquireVsCodeApi();

const TABS = [
    { id: 'general', label: 'General' },
    { id: 'themes', label: 'Themes & Syntax' },
    { id: 'java', label: 'Java Formatter' },
    { id: 'jsp', label: 'JSP Formatter' },
    { id: 'shortcuts', label: 'Keyboard Shortcuts' },
];

export default function App() {
    const [state, setState] = useState(null);
    const [tab, setTab] = useState('general');
    const [error, setError] = useState(null);
    const [editor, setEditor] = useState(null); // {id, name, content, kind}
    const [fmtEditor, setFmtEditor] = useState(null); // {profile, settings, preview, loaded}
    const [jspEditor, setJspEditor] = useState(null); // {profile, data, preview, loaded}
    const stateRef = useRef(null);
    stateRef.current = state;

    useEffect(() => {
        const handler = (event) => {
            const msg = event.data;
            if (!msg || typeof msg !== 'object') {
                return;
            }
            if (msg.type === 'state') {
                setState(msg.state);
                setError(null);
                if (typeof msg.tab === 'string' && TABS.some((t) => t.id === msg.tab)) {
                    setTab(msg.tab);
                }
            } else if (msg.type === 'profileContent') {
                const profile = findProfile(stateRef.current, msg.id);
                setEditor({
                    id: msg.id,
                    name: profile?.name ?? msg.id,
                    kind: profile?.kind ?? 'jsp',
                    content: msg.content ?? '',
                });
            } else if (msg.type === 'formatterOptions') {
                setFmtEditor((prev) =>
                    prev && prev.profile.id === msg.id
                        ? { ...prev, settings: msg.settings ?? {}, loaded: true }
                        : prev,
                );
            } else if (msg.type === 'formatPreviewResult') {
                setFmtEditor((prev) => (prev && prev.profile.id === msg.id ? { ...prev, preview: msg.formatted ?? '' } : prev));
            } else if (msg.type === 'jspProfileOptions') {
                setJspEditor((prev) =>
                    prev && prev.profile.id === msg.id ? { ...prev, data: msg.profile ?? null, loaded: true } : prev,
                );
            } else if (msg.type === 'jspFormatPreviewResult') {
                setJspEditor((prev) =>
                    prev && prev.profile.id === msg.id ? { ...prev, preview: msg.formatted ?? '' } : prev,
                );
            } else if (msg.type === 'error') {
                setError(msg.message ?? 'Unknown error');
            }
        };
        window.addEventListener('message', handler);
        vscode.postMessage({ type: 'ready' });
        return () => window.removeEventListener('message', handler);
    }, []);

    if (!state) {
        return (
            <div id="root">
                <p className="muted">Loading JavaScope configuration…</p>
            </div>
        );
    }

    const send = (message) => vscode.postMessage(message);

    return (
        <div id="root">
            <nav className="tabs">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        className={`tab ${tab === t.id ? 'active' : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </nav>

            {error && (
                <div className="banner error">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {state.configStatus.problems.length > 0 && (
                <div className="banner warning">
                    <strong>Configuration problems detected:</strong>
                    <ul>
                        {state.configStatus.problems.map((p, i) => (
                            <li key={i}>
                                <code>{p.location}</code>
                                <ul>
                                    {p.problems.map((pr, j) => (
                                        <li key={j}>{pr}</li>
                                    ))}
                                </ul>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {tab === 'general' && <General state={state} send={send} />}
            {tab === 'themes' && <Themes state={state} send={send} />}
            {tab === 'java' && (
                <FormatterSection
                    kind="java"
                    state={state}
                    send={send}
                    onEditOptions={(p) => {
                        setFmtEditor({ profile: p, settings: null, preview: '', loaded: false });
                        send({ type: 'getFormatterOptions', id: p.id });
                    }}
                />
            )}
            {tab === 'jsp' && (
                <FormatterSection
                    kind="jsp"
                    state={state}
                    send={send}
                    onEditOptions={(p) => {
                        setJspEditor({ profile: p, data: null, preview: '', loaded: false });
                        send({ type: 'getJspProfileOptions', id: p.id });
                    }}
                />
            )}
            {tab === 'shortcuts' && <Shortcuts state={state} />}

            {editor && (
                <ProfileEditor
                    editor={editor}
                    onClose={() => setEditor(null)}
                    onSave={(content) => {
                        send({ type: 'updateProfileContent', id: editor.id, content });
                        setEditor(null);
                    }}
                />
            )}

            {fmtEditor && (
                <FormatterOptionsEditor
                    editor={fmtEditor}
                    javaInfo={state.javaFormatter}
                    palette={findActiveThemePreview(state)}
                    send={send}
                    onClose={() => setFmtEditor(null)}
                    onShowXml={() => {
                        send({ type: 'getProfileContent', id: fmtEditor.profile.id });
                        setFmtEditor(null);
                    }}
                />
            )}

            {jspEditor && (
                <JspFormatterOptionsEditor
                    editor={jspEditor}
                    palette={findActiveThemePreview(state)}
                    send={send}
                    onClose={() => setJspEditor(null)}
                    onShowJson={() => {
                        send({ type: 'getProfileContent', id: jspEditor.profile.id });
                        setJspEditor(null);
                    }}
                />
            )}
        </div>
    );
}

function findProfile(state, id) {
    if (!state) return null;
    return (
        state.javaFormatter.profiles.find((p) => p.id === id) ??
        state.jspFormatter.profiles.find((p) => p.id === id) ??
        null
    );
}

function Toggle({ checked, onChange, disabled }) {
    // label (not span): clicks on the visual slider must forward to the
    // zero-size checkbox input, otherwise the switch is decorative only.
    return (
        <label className={`switch ${disabled ? 'disabled' : ''}`}>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span className="slider" />
        </label>
    );
}

function OriginBadge({ origin }) {
    return <span className={`origin ${origin}`}>{origin}</span>;
}

/** Mini code sample rendered with a theme's palette for visual comparison. */
/** JSP template sample rendered with the scheme's HTML palette (Eclipse schemes). */
function JspTemplatePreview({ preview, type }) {
    if (!preview) {
        return null;
    }
    const c = (key) => preview[key] ?? 'inherit';
    return (
        <pre className={`code-preview ${type === 'dark' ? 'dark' : ''}`} style={{ color: c('foreground') }}>
            <span style={{ color: c('keyword') }}>&lt;%@ page</span>{' '}
            <span style={{ color: c('htmlAttribute') }}>language</span>=
            <span style={{ color: c('htmlString') }}>&quot;java&quot;</span>{' '}
            <span style={{ color: c('keyword') }}>%&gt;</span>
            {'\n'}
            <span style={{ color: c('htmlTag') }}>&lt;c:forEach</span>{' '}
            <span style={{ color: c('htmlAttribute') }}>items</span>=
            <span style={{ color: c('htmlString') }}>
                &quot;<span style={{ color: c('elExpression') }}>{'${users}'}</span>&quot;
            </span>{' '}
            <span style={{ color: c('htmlAttribute') }}>var</span>=
            <span style={{ color: c('htmlString') }}>&quot;u&quot;</span>
            <span style={{ color: c('htmlTag') }}>&gt;</span>
            {'\n  '}
            <span style={{ color: c('htmlTag') }}>&lt;div</span>{' '}
            <span style={{ color: c('htmlAttribute') }}>class</span>=
            <span style={{ color: c('htmlString') }}>&quot;user&quot;</span>
            <span style={{ color: c('htmlTag') }}>&gt;</span>
            <span style={{ color: c('elExpression') }}>{'${user.name}'}</span>
            <span style={{ color: c('htmlTag') }}>&lt;/div&gt;</span>
        </pre>
    );
}

function ThemePreview({ preview, type, styles }) {
    if (!preview) {
        return null;
    }
    const c = (key) => preview[key] ?? 'inherit';
    const constant = styles?.constant ?? '';
    const constantWeight = constant.includes('bold') ? 'bold' : undefined;
    const constantStyle = constant.includes('italic') ? 'italic' : undefined;
    return (
        <pre
            className={`code-preview ${type === 'dark' ? 'dark' : ''}`}
            style={{ color: c('foreground') }}
        >
            <span style={{ color: c('keyword') }}>package</span> com<span style={{ color: c('operator') }}>.</span>acme
            {'\n'}
            <span style={{ color: c('javadoc') }}>{'/** Sample '}</span>
            <span style={{ color: c('javadocTag') }}>@param</span>
            <span style={{ color: c('javadoc') }}>{' name */'}</span>
            {'\n'}
            <span style={{ color: c('annotation') }}>@RestController</span>
            {'\n'}
            <span style={{ color: c('keyword') }}>public class</span> <span style={{ color: c('className') }}>Order</span>{' {'}
            {'\n  '}
            <span style={{ color: c('keyword') }}>private static final int</span>{' '}
            <span style={{ color: c('staticField'), fontWeight: constantWeight, fontStyle: constantStyle }}>MAX_ORDERS</span>{' '}
            = <span style={{ color: c('number') }}>100</span>;
            {'\n  '}
            <span style={{ color: c('keyword') }}>private final</span> <span style={{ color: c('className') }}>List</span>{' '}
            <span style={{ color: c('field') }}>orders</span>;
            {'\n  '}
            <span style={{ color: c('methodDeclaration') }}>add</span>(<span style={{ color: c('className') }}>String</span>{' '}
            <span style={{ color: c('parameter') }}>name</span>) {'{'}
            {'\n    '}
            <span style={{ color: c('keyword') }}>int</span> <span style={{ color: c('localVariable') }}>total</span> ={' '}
            <span style={{ color: c('number') }}>0</span>;
            {'\n    '}
            <span style={{ color: c('keyword') }}>return</span> <span style={{ color: c('string') }}>"ok"</span>;
            {'\n  }'}
            {'\n}'}
        </pre>
    );
}

function General({ state, send }) {
    const s = state.settings;
    return (
        <div>
            <p className="subtitle">
                Eclipse &amp; IntelliJ-inspired Java colors and formatting. Changes are saved to{' '}
                <code>.javascope/settings.json</code>.
            </p>

            <div className="card">
                <h2>JavaScope</h2>
                <div className="row between">
                    <label>
                        Enable JavaScope
                        <div className="muted">Master switch. Disabling turns off colors and formatters.</div>
                    </label>
                    <Toggle
                        checked={s.enabled.value}
                        onChange={(v) => send({ type: 'updateSettings', patch: { enabled: v } })}
                    />
                </div>
            </div>

            <div className="card">
                <h2>Configuration</h2>
                <div className="row">
                    <label>
                        Configuration location
                        <div className="muted">Where settings are persisted. "Auto" uses the workspace folder when open.</div>
                    </label>
                    <select
                        value={s.configurationLocation.value}
                        onChange={(e) => send({ type: 'selectConfigLocation', location: e.target.value })}
                    >
                        <option value="auto">Auto (workspace when open)</option>
                        <option value="user">User (~/.javascope)</option>
                        <option value="workspace">Workspace (.javascope)</option>
                    </select>
                </div>
                <div className="row">
                    <span className="muted">User configuration</span>
                    <code>{state.configStatus.userDir}</code>
                    <span className={`status-dot ${state.configStatus.hasUserSettings ? 'ok' : 'bad'}`} />
                    <span className="muted">{state.configStatus.hasUserSettings ? 'settings.json found' : 'not created yet'}</span>
                    <button className="action" onClick={() => send({ type: 'openConfigDir', target: 'user' })}>
                        Open Folder
                    </button>
                </div>
                <div className="row">
                    <span className="muted">Workspace configuration</span>
                    <code>{state.configStatus.workspaceDir ?? '(no folder open)'}</code>
                    {state.configStatus.workspaceDir && (
                        <>
                            <span className={`status-dot ${state.configStatus.hasWorkspaceSettings ? 'ok' : 'bad'}`} />
                            <span className="muted">
                                {state.configStatus.hasWorkspaceSettings ? 'settings.json found' : 'not created yet'}
                            </span>
                            <button className="action" onClick={() => send({ type: 'openConfigDir', target: 'workspace' })}>
                                Open Folder
                            </button>
                        </>
                    )}
                </div>
                <div className="row">
                    <span className="muted">
                        Updates are currently written to the <strong>{state.configStatus.targetDir}</strong>{' '}
                        configuration.
                    </span>
                    <button className="action" onClick={() => send({ type: 'reload' })}>
                        Reload Configuration
                    </button>
                </div>
            </div>
        </div>
    );
}

function Themes({ state, send }) {
    const themes = state.themes;
    const cards = useMemo(
        () => [
            ...themes.builtins.map((t) => ({ ...t, origin: 'builtin' })),
            ...themes.customs.map((t) => ({ ...t })),
        ],
        [themes],
    );
    const active = cards.find((t) => t.id === themes.active);
    const activeHasJspPalette = Boolean(active?.preview?.htmlTag);
    const workbenchMismatch = Boolean(
        themes.enabled && active && active.type !== themes.workbenchKind,
    );
    return (
        <div>
            <div className="card">
                <div className="row between">
                    <label>
                        Enable JavaScope color customization
                        <div className="muted">
                            Applies the selected scheme to Java/JSP editors only. Your VS Code interface theme is
                            untouched.
                        </div>
                    </label>
                    <Toggle checked={themes.enabled} onChange={(v) => send({ type: 'toggleThemes', enabled: v })} />
                </div>
                <div className="row between">
                    <label>
                        Also color JSP/HTML templates
                        <div className="muted">
                            Tags, attributes and EL expressions inside .jsp files get the scheme's HTML palette
                            (Eclipse schemes). Standalone .html files keep your VS Code theme.
                            {!activeHasJspPalette &&
                                ' This scheme has no HTML palette — define one in a custom theme (colors: htmlTag, htmlAttribute, htmlString, elExpression) to use this.'}
                        </div>
                    </label>
                    <Toggle
                        checked={themes.jspTemplatesEnabled && activeHasJspPalette}
                        disabled={!themes.enabled || !activeHasJspPalette}
                        onChange={(v) => send({ type: 'toggleJspTemplates', enabled: v })}
                    />
                </div>
                {themes.jspTemplatesEnabled && activeHasJspPalette && active && (
                    <JspTemplatePreview preview={active.preview} type={active.type} />
                )}
            </div>

            {workbenchMismatch && active && (
                <div className="banner warning">
                    <strong>
                        “{active.name}” is a {active.type} scheme, but your VS Code theme is {themes.workbenchKind}.
                    </strong>{' '}
                    For the intended look, change the VS Code color theme too: <code>Ctrl+K Ctrl+T</code> (File →
                    Preferences → Theme → Color Theme). JavaScope never changes the workbench theme on its own.
                </div>
            )}

            <div className="card">
                <h2>Editor Color Schemes</h2>
                <div className="grid">
                    {cards.map((t) => (
                        <div
                            key={t.id}
                            className={`theme-card ${themes.active === t.id ? 'active' : ''}`}
                            onClick={() => themes.enabled && send({ type: 'setTheme', id: t.id })}
                        >
                            <div className="name">
                                {t.name} <OriginBadge origin={t.origin} />
                                {themes.active === t.id && <span className="origin user">active</span>}
                            </div>
                            <div className="muted">
                                {t.type === 'dark' ? 'Dark' : 'Light'} · {t.id}
                            </div>
                            <ThemePreview preview={t.preview} type={t.type} styles={t.previewStyles} />
                            {t.preview?.htmlTag && <JspTemplatePreview preview={t.preview} type={t.type} />}
                        </div>
                    ))}
                </div>
                {cards.length === 0 && <p className="muted">No themes available.</p>}
            </div>

            {themes.errors.length > 0 && (
                <div className="banner error">
                    <strong>Custom theme problems:</strong>
                    <ul>
                        {themes.errors.map((e, i) => (
                            <li key={i}>
                                <code>{e.path}</code>: {e.error}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="card">
                <h2>Custom Themes</h2>
                <p className="muted">
                    Drop a theme JSON file into <code>themes/</code> under your user or workspace{' '}
                    <code>.javascope</code> folder. It appears here automatically.
                </p>
            </div>
        </div>
    );
}

function FormatterSection({ kind, state, send, onEditOptions }) {
    const info = kind === 'java' ? state.javaFormatter : state.jspFormatter;
    const [dialog, setDialog] = useState(null); // 'new' | { rename: profile }
    const active = info.profiles.find((p) => p.id === info.activeProfile) ?? info.profiles[0];
    const groups = useMemo(() => {
        const g = { builtin: [], user: [], workspace: [] };
        for (const p of info.profiles) {
            (g[p.origin] ?? g.user).push(p);
        }
        return g;
    }, [info.profiles]);

    return (
        <div>
            <div className="card">
                <h2>{kind === 'java' ? 'Java Formatter (Eclipse JDT)' : 'JSP Formatter'}</h2>
                <div className="row between">
                    <label>
                        Enable formatter
                        <div className="muted">
                            {kind === 'java'
                                ? 'Formats Java with the official Eclipse JDT formatter engine.'
                                : 'Formats JSP documents: HTML structure, JSP directives, scriptlets and EL.'}
                        </div>
                    </label>
                    <Toggle checked={info.enabled} onChange={(v) => send({ type: 'toggleFormatter', kind, enabled: v })} />
                </div>
                <div className="row between">
                    <label>
                        Format on save
                        <div className="muted">Applies when saving {kind === 'java' ? 'Java' : 'JSP'} documents.</div>
                    </label>
                    <Toggle
                        checked={info.formatOnSave}
                        onChange={(v) => send({ type: 'setFormatOnSave', kind, value: v })}
                    />
                </div>
                {kind === 'java' && (
                    <div className="row">
                        <span className="muted">Formatter runtime</span>
                        <span className={`status-dot ${info.runtimeAvailable ? 'ok' : 'bad'}`} />
                        <span className="muted">Java runtime {info.runtimeAvailable ? 'available' : 'NOT found'}</span>
                        <span className={`status-dot ${info.jarPresent ? 'ok' : 'bad'}`} />
                        <span className="muted">JDT formatter JAR {info.jarPresent ? 'bundled' : 'MISSING'}</span>
                    </div>
                )}
            </div>

            <div className="card">
                <h2>Formatter Profile</h2>
                <div className="row">
                    <label style={{ flex: '0 0 auto', minWidth: 0 }}>Active profile</label>
                    <select
                        className="profile-select"
                        value={info.activeProfile}
                        disabled={!info.enabled}
                        onChange={(e) => send({ type: 'setActiveProfile', kind, id: e.target.value })}
                    >
                        <optgroup label="Built-in">
                            {groups.builtin.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </optgroup>
                        {groups.user.length > 0 && (
                            <optgroup label="Global (all projects)">
                                {groups.user.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        {groups.workspace.length > 0 && (
                            <optgroup label="Workspace (this project)">
                                {groups.workspace.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                    <button className="action primary" onClick={() => setDialog('new')}>
                        New…
                    </button>
                    <button
                        className="action"
                        disabled={!active}
                        onClick={() => {
                            if (active && active.origin !== 'builtin' && onEditOptions) {
                                onEditOptions(active);
                            } else {
                                send({ type: 'getProfileContent', id: active.id });
                            }
                        }}
                    >
                        {active?.origin !== 'builtin' ? 'Edit options…' : 'Edit…'}
                    </button>
                    <button
                        className="action"
                        disabled={!active || active.origin === 'builtin'}
                        onClick={() => setDialog({ rename: active })}
                    >
                        Rename…
                    </button>
                    <button
                        className="action"
                        disabled={!active}
                        onClick={() => send({ type: 'exportProfile', id: active.id })}
                    >
                        Export…
                    </button>
                    <button
                        className="action"
                        disabled={!active || active.origin === 'builtin' || info.activeProfile === active.id}
                        onClick={() => {
                            if (window.confirm(`Remove profile '${active.name}'?`)) {
                                send({ type: 'deleteProfile', id: active.id });
                            }
                        }}
                    >
                        Remove
                    </button>
                    <button className="action" onClick={() => send({ type: 'importProfile', kind })}>
                        Import…
                    </button>
                </div>
                <p className="muted">
                    {kind === 'java'
                        ? 'Profiles are standard Eclipse CodeFormatterProfile files. "Eclipse [built-in]" is the Eclipse IDE default; New… initializes from it or any other profile, and saves globally so other projects can reuse it.'
                        : 'Profiles are JavaScope JSP formatting rules (JSON). New… starts from the built-in defaults and saves globally.'}
                </p>
                {active && (
                    <p className="muted">
                        Active: <strong>{active.name}</strong> <OriginBadge origin={active.origin} />{' '}
                        <code>{active.id}</code>
                        {active.origin === 'builtin' && ' — read-only; use New… to create an editable copy.'}
                    </p>
                )}
            </div>

            {dialog === 'new' && (
                <NewProfileDialog
                    kind={kind}
                    profiles={info.profiles}
                    onClose={() => setDialog(null)}
                    onCreate={(v) => {
                        send({ type: 'createProfile', kind, ...v });
                        setDialog(null);
                    }}
                />
            )}
            {dialog && dialog.rename && (
                <RenameProfileDialog
                    profile={dialog.rename}
                    onClose={() => setDialog(null)}
                    onRename={(name) => {
                        send({ type: 'renameProfile', id: dialog.rename.id, name });
                        setDialog(null);
                    }}
                />
            )}
        </div>
    );
}

function NewProfileDialog({ kind, profiles, onClose, onCreate }) {
    const [name, setName] = useState('');
    const [duplicateFrom, setDuplicateFrom] = useState('');
    const [origin, setOrigin] = useState('user');
    const submit = () => {
        if (name.trim()) {
            onCreate({ name: name.trim(), duplicateFrom: duplicateFrom || undefined, origin });
        }
    };
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
                <h3>New {kind === 'java' ? 'Java' : 'JSP'} formatter profile</h3>
                <div className="form-field">
                    <label>Profile name</label>
                    <input
                        autoFocus
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submit()}
                        placeholder="My company style"
                    />
                </div>
                <div className="form-field">
                    <label>Initialize from</label>
                    <select value={duplicateFrom} onChange={(e) => setDuplicateFrom(e.target.value)}>
                        <option value="">
                            {kind === 'java' ? 'Eclipse [built-in] (default)' : 'Built-in defaults'}
                        </option>
                        {profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                                Duplicate: {p.name}
                            </option>
                        ))}
                    </select>
                    <div className="muted">Reuse an existing profile or start from the Eclipse defaults.</div>
                </div>
                <div className="form-field">
                    <label>Save to</label>
                    <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                        <option value="user">Global — ~/.javascope (all projects)</option>
                        <option value="workspace">Workspace — .javascope (this project only)</option>
                    </select>
                </div>
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                    <button className="action" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="action primary" disabled={!name.trim()} onClick={submit}>
                        Create Profile
                    </button>
                </div>
            </div>
        </div>
    );
}

function RenameProfileDialog({ profile, onClose, onRename }) {
    const [name, setName] = useState(profile.name);
    const submit = () => {
        if (name.trim()) {
            onRename(name.trim());
        }
    };
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
                <h3>Rename profile</h3>
                <div className="form-field">
                    <label>Profile name</label>
                    <input
                        autoFocus
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submit()}
                    />
                </div>
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                    <button className="action" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="action primary" disabled={!name.trim()} onClick={submit}>
                        Rename
                    </button>
                </div>
            </div>
        </div>
    );
}

function ProfileEditor({ editor, onClose, onSave }) {
    const [content, setContent] = useState(editor.content);
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>
                    Edit profile: {editor.name}{' '}
                    <span className="muted">{editor.kind === 'java' ? 'Eclipse formatter XML' : 'JSP profile JSON'}</span>
                </h3>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} />
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                    <button className="action" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="action primary" onClick={() => onSave(content)}>
                        Save Profile
                    </button>
                </div>
            </div>
        </div>
    );
}

function Shortcuts({ state }) {
    return (
        <div className="card">
            <h2>JavaScope Commands</h2>
            <table>
                <thead>
                    <tr>
                        <th>Command</th>
                        <th>Command id</th>
                    </tr>
                </thead>
                <tbody>
                    {state.commands.map((c) => (
                        <tr key={c.id}>
                            <td>{c.title}</td>
                            <td>
                                <code>{c.id}</code>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="muted" style={{ marginTop: 12 }}>
                JavaScope registers <code>Ctrl/Cmd+Alt+F</code> for "Format Java" and "Format JSP" (context-aware by
                language), plus <code>Ctrl/Cmd+Alt+Shift+F</code> for "Format Java Selection". All three are also in the
                editor right-click menu, and a format button sits in the editor title bar next to the tabs. To hide that
                button, right-click the title bar and uncheck it (it moves to the <code>…</code> overflow — recheck to
                restore), or set <code>javascope.showEditorActions</code> to <code>false</code>; shortcuts and menus keep
                working either way. VS Code's standard <code>Shift+Alt+F</code> Format Document is untouched. To change
                keybindings, open <strong>File → Preferences → Keyboard Shortcuts</strong>, search for "JavaScope".
                JavaScope never modifies unrelated shortcuts.
            </p>
        </div>
    );
}

/**
 * Visual editor for the most-used Eclipse formatter options.
 * Keep FORM_OPTION_DEFS in sync with src/formatter/formatterOptions.ts
 * (ids are relative to the org.eclipse.jdt.core.formatter. prefix).
 */
const EPREFIX = 'org.eclipse.jdt.core.formatter.';
const BRACE_CHOICES = [
    { value: 'end_of_line', label: 'Same line' },
    { value: 'next_line', label: 'Next line' },
];
const FORM_OPTION_DEFS = [
    {
        key: 'tabPolicy',
        label: 'Tab policy',
        group: 'Indentation',
        kind: 'enum',
        ids: ['tabulation.char'],
        choices: [
            { value: 'tab', label: 'Tabs' },
            { value: 'space', label: 'Spaces' },
        ],
        defaultValue: 'tab',
    },
    { key: 'indentSize', label: 'Indentation size', group: 'Indentation', kind: 'int', ids: ['indentation.size'], min: 1, max: 16, defaultValue: '4' },
    { key: 'tabSize', label: 'Displayed tab size', group: 'Indentation', kind: 'int', ids: ['tabulation.size'], min: 1, max: 16, defaultValue: '4' },
    { key: 'braceType', label: 'Class / interface braces', group: 'Braces', kind: 'enum', ids: ['brace_position_for_type_declaration'], choices: BRACE_CHOICES, defaultValue: 'end_of_line' },
    { key: 'braceMethod', label: 'Method braces', group: 'Braces', kind: 'enum', ids: ['brace_position_for_method_declaration'], choices: BRACE_CHOICES, defaultValue: 'end_of_line' },
    { key: 'braceBlock', label: 'Block braces (if / for / while)', group: 'Braces', kind: 'enum', ids: ['brace_position_for_block'], choices: BRACE_CHOICES, defaultValue: 'end_of_line' },
    { key: 'braceArray', label: 'Array initializer braces', group: 'Braces', kind: 'enum', ids: ['brace_position_for_array_initializer'], choices: BRACE_CHOICES, defaultValue: 'end_of_line' },
    {
        key: 'spaceControlParen',
        label: 'Space before ( in if / for / while / switch / catch',
        group: 'Spacing',
        kind: 'bool',
        ids: [
            'insert_space_before_opening_paren_in_if',
            'insert_space_before_opening_paren_in_for',
            'insert_space_before_opening_paren_in_while',
            'insert_space_before_opening_paren_in_switch',
            'insert_space_before_opening_paren_in_catch',
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
            'insert_space_after_comma_in_method_invocation_arguments',
            'insert_space_after_comma_in_method_declaration_parameters',
            'insert_space_after_comma_in_constructor_declaration_parameters',
            'insert_space_after_comma_in_for_inits',
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
        ids: ['insert_space_before_assignment_operator', 'insert_space_after_assignment_operator'],
        onValue: 'insert',
        offValue: 'do not insert',
        defaultValue: 'insert',
    },
    { key: 'lineSplit', label: 'Maximum line width', group: 'Line width', kind: 'int', ids: ['lineSplit'], min: 40, max: 400, defaultValue: '120' },
];

function toEclipseValue(def, raw) {
    if (def.kind === 'bool') {
        return raw === 'on' ? def.onValue : def.offValue;
    }
    return raw;
}

function flattenFormValues(values) {
    const flat = {};
    for (const def of FORM_OPTION_DEFS) {
        const raw = values[def.key] ?? def.defaultValue;
        const value = toEclipseValue(def, raw);
        for (const id of def.ids) {
            flat[EPREFIX + id] = value;
        }
    }
    return flat;
}

function FormatterOptionsEditor({ editor, javaInfo, palette, send, onClose, onShowXml }) {
    const [values, setValues] = useState(null);

    // Initialize from the parsed profile once the extension sends it.
    useEffect(() => {
        if (!values && editor.loaded && editor.settings) {
            const init = {};
            for (const def of FORM_OPTION_DEFS) {
                let raw;
                for (const id of def.ids) {
                    const full = EPREFIX + id;
                    if (editor.settings[full] !== undefined) {
                        raw = editor.settings[full];
                        break;
                    }
                }
                init[def.key] = def.kind === 'bool' ? (raw === def.onValue ? 'on' : 'off') : (raw ?? def.defaultValue);
            }
            setValues(init);
        }
    }, [values, editor.loaded, editor.settings]);

    // Debounced live preview through the bundled Eclipse JDT formatter.
    useEffect(() => {
        if (!values || !javaInfo.runtimeAvailable) {
            return undefined;
        }
        const flat = flattenFormValues(values);
        const timer = setTimeout(() => {
            send({ type: 'formatPreview', id: editor.profile.id, settings: flat });
        }, 400);
        return () => clearTimeout(timer);
    }, [values, javaInfo.runtimeAvailable, editor.profile.id, send]);

    const save = () => {
        send({ type: 'updateFormatterOptions', id: editor.profile.id, settings: flattenFormValues(values) });
        onClose();
    };

    if (!values) {
        return (
            <div className="modal-backdrop" onClick={onClose}>
                <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
                    <h3>Loading formatter options…</h3>
                </div>
            </div>
        );
    }

    const groups = [...new Set(FORM_OPTION_DEFS.map((d) => d.group))];
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
                <h3>
                    Formatter options: {editor.profile.name} <span className="muted">Eclipse JDT</span>
                </h3>
                <div className="options-grid">
                    <div>
                        {groups.map((g) => (
                            <div className="opt-group" key={g}>
                                <h4>{g}</h4>
                                {FORM_OPTION_DEFS.filter((d) => d.group === g).map((d) => (
                                    <div className="row between" key={d.key}>
                                        <label htmlFor={'opt-' + d.key}>{d.label}</label>
                                        {d.kind === 'enum' && (
                                            <select
                                                id={'opt-' + d.key}
                                                value={values[d.key]}
                                                onChange={(e) => setValues({ ...values, [d.key]: e.target.value })}
                                            >
                                                {d.choices.map((c) => (
                                                    <option key={c.value} value={c.value}>
                                                        {c.label}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        {d.kind === 'int' && (
                                            <input
                                                id={'opt-' + d.key}
                                                type="number"
                                                min={d.min}
                                                max={d.max}
                                                style={{ width: 84 }}
                                                value={values[d.key]}
                                                onChange={(e) =>
                                                    setValues({ ...values, [d.key]: e.target.value.replace(/[^0-9]/g, '') })
                                                }
                                            />
                                        )}
                                        {d.kind === 'bool' && (
                                            <Toggle
                                                checked={values[d.key] === 'on'}
                                                onChange={(v) => setValues({ ...values, [d.key]: v ? 'on' : 'off' })}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                        <p className="muted" style={{ marginTop: 12 }}>
                            Advanced:{' '}
                            <button type="button" className="link" onClick={onShowXml}>
                                edit the raw profile XML…
                            </button>
                        </p>
                    </div>
                    <div>
                        <h4>Live preview</h4>
                        {!javaInfo.runtimeAvailable && (
                            <p className="muted">Java runtime not found — preview unavailable; saving still works.</p>
                        )}
                        {editor.preview ? (
                            <JavaPreviewCode code={editor.preview} palette={palette} />
                        ) : (
                            <pre className="code-preview fmt-preview muted">Formatting…</pre>
                        )}
                    </div>
                </div>
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                    <button className="action" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="action primary" onClick={save}>
                        Save Options
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Palette of the active JavaScope scheme (built-in or custom), if any. */
function findActiveThemePreview(state) {
    if (!state) {
        return null;
    }
    const t = state.themes;
    const all = [...t.builtins, ...t.customs];
    return all.find((x) => x.id === t.active)?.preview ?? null;
}

const JAVA_TOKEN_RE =
    /(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)|("(?:\\.|[^"\\\n])*")|('(?:\\.|[^'\\\n])*')|(@[A-Za-z_]\w*)|\b(public|protected|private|static|final|abstract|synchronized|class|interface|enum|record|void|int|long|boolean|byte|short|float|double|char|if|else|for|while|do|switch|case|default|break|continue|return|new|extends|implements|throws|throw|try|catch|finally|import|package|instanceof|this|super|null|true|false|var)\b|\b(0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?[lLfFdD]?)\b|\b([A-Z][A-Za-z0-9_]*)\b/g;

/** Minimal Java highlighter for the preview (comments, strings, keywords, numbers, types). */
function highlightJava(code) {
    const out = [];
    let last = 0;
    JAVA_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = JAVA_TOKEN_RE.exec(code)) !== null) {
        if (m.index > last) {
            out.push({ type: 'plain', text: code.slice(last, m.index) });
        }
        const type = m[1] || m[2] ? 'comment' : m[3] || m[4] ? 'string' : m[5] ? 'annotation' : m[6] ? 'keyword' : m[7] ? 'number' : 'type';
        out.push({ type, text: m[0] });
        last = m.index + m[0].length;
    }
    if (last < code.length) {
        out.push({ type: 'plain', text: code.slice(last) });
    }
    return out;
}

/** Formatted Java preview, colored with the active scheme's palette. */
function JavaPreviewCode({ code, palette }) {
    const spans = useMemo(() => highlightJava(code), [code]);
    const c = (key) => palette?.[key] ?? 'inherit';
    const colorFor = (type) =>
        type === 'keyword'
            ? c('keyword')
            : type === 'string'
              ? c('string')
              : type === 'number'
                ? c('number')
                : type === 'comment'
                  ? c('comment')
                  : type === 'annotation'
                    ? c('annotation')
                    : type === 'type'
                      ? c('className')
                      : 'inherit';
    return (
        <pre className="code-preview fmt-preview" style={{ color: c('foreground') }}>
            {spans.map((s, i) => (
                <span key={i} style={{ color: colorFor(s.type) }}>
                    {s.text}
                </span>
            ))}
        </pre>
    );
}

const JSP_OPTION_DEFS = [
    {
        key: 'indentStyle',
        label: 'Indent with',
        group: 'Indentation',
        kind: 'enum',
        choices: [
            { value: 'space', label: 'Spaces' },
            { value: 'tab', label: 'Tabs' },
        ],
        defaultValue: 'space',
    },
    { key: 'indentSize', label: 'Indent size', group: 'Indentation', kind: 'int', min: 1, max: 16, defaultValue: '4' },
    { key: 'lineWidth', label: 'Maximum line width', group: 'Layout', kind: 'int', min: 40, max: 400, defaultValue: '120' },
    { key: 'maxBlankLines', label: 'Max consecutive blank lines', group: 'Layout', kind: 'int', min: 0, max: 5, defaultValue: '1' },
    { key: 'trimTrailingWhitespace', label: 'Trim trailing whitespace', group: 'Behavior', kind: 'bool', defaultValue: 'on' },
    { key: 'formatScriptletJava', label: 'Format Java inside scriptlets (Eclipse JDT)', group: 'Behavior', kind: 'bool', defaultValue: 'on' },
    { key: 'blankLineAfterDirective', label: 'Blank line after directives', group: 'Behavior', kind: 'bool', defaultValue: 'on' },
    { key: 'keepInlineIfShort', label: 'Keep short elements on one line', group: 'Behavior', kind: 'bool', defaultValue: 'on' },
    {
        key: 'wrapAttributes',
        label: 'Wrap tag attributes',
        group: 'HTML',
        kind: 'enum',
        choices: [
            { value: 'auto', label: 'Auto (on overflow)' },
            { value: 'force', label: 'Force (one per line)' },
            { value: 'preserve', label: 'Preserve' },
        ],
        defaultValue: 'auto',
    },
];

function jspValuesFromProfile(data) {
    return {
        indentStyle: data?.indentation?.style ?? 'space',
        indentSize: String(data?.indentation?.size ?? 4),
        lineWidth: String(data?.lineWidth ?? 120),
        maxBlankLines: String(data?.maxBlankLines ?? 1),
        trimTrailingWhitespace: data?.trimTrailingWhitespace ? 'on' : 'off',
        formatScriptletJava: data?.formatScriptletJava ? 'on' : 'off',
        blankLineAfterDirective: data?.blankLineAfterDirective ? 'on' : 'off',
        keepInlineIfShort: data?.keepInlineIfShort ? 'on' : 'off',
        wrapAttributes: data?.html?.wrapAttributes ?? 'auto',
    };
}

function jspProfileFromValues(values, base) {
    return {
        ...(base ?? {}),
        indentation: { style: values.indentStyle, size: parseInt(values.indentSize, 10) || 4 },
        lineWidth: parseInt(values.lineWidth, 10) || 120,
        maxBlankLines: parseInt(values.maxBlankLines, 10) || 0,
        trimTrailingWhitespace: values.trimTrailingWhitespace === 'on',
        formatScriptletJava: values.formatScriptletJava === 'on',
        blankLineAfterDirective: values.blankLineAfterDirective === 'on',
        keepInlineIfShort: values.keepInlineIfShort === 'on',
        html: { wrapAttributes: values.wrapAttributes },
    };
}

function JspFormatterOptionsEditor({ editor, palette, send, onClose, onShowJson }) {
    const [values, setValues] = useState(null);

    useEffect(() => {
        if (!values && editor.loaded && editor.data) {
            setValues(jspValuesFromProfile(editor.data));
        }
    }, [values, editor.loaded, editor.data]);

    // Debounced live preview through the in-process JSP formatter.
    useEffect(() => {
        if (!values) {
            return undefined;
        }
        const profile = jspProfileFromValues(values, editor.data);
        const timer = setTimeout(() => {
            send({ type: 'jspFormatPreview', id: editor.profile.id, profile });
        }, 400);
        return () => clearTimeout(timer);
    }, [values, editor.data, editor.profile.id, send]);

    const save = () => {
        const profile = jspProfileFromValues(values, editor.data);
        send({ type: 'updateProfileContent', id: editor.profile.id, content: JSON.stringify(profile, null, 2) });
        onClose();
    };

    if (!values) {
        return (
            <div className="modal-backdrop" onClick={onClose}>
                <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
                    <h3>Loading profile options…</h3>
                </div>
            </div>
        );
    }

    const groups = [...new Set(JSP_OPTION_DEFS.map((d) => d.group))];
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
                <h3>
                    Formatter options: {editor.profile.name} <span className="muted">JSP profile</span>
                </h3>
                <div className="options-grid">
                    <div>
                        {groups.map((g) => (
                            <div className="opt-group" key={g}>
                                <h4>{g}</h4>
                                {JSP_OPTION_DEFS.filter((d) => d.group === g).map((d) => (
                                    <div className="row between" key={d.key}>
                                        <label htmlFor={'jopt-' + d.key}>{d.label}</label>
                                        {d.kind === 'enum' && (
                                            <select
                                                id={'jopt-' + d.key}
                                                value={values[d.key]}
                                                onChange={(e) => setValues({ ...values, [d.key]: e.target.value })}
                                            >
                                                {d.choices.map((ch) => (
                                                    <option key={ch.value} value={ch.value}>
                                                        {ch.label}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        {d.kind === 'int' && (
                                            <input
                                                id={'jopt-' + d.key}
                                                type="number"
                                                min={d.min}
                                                max={d.max}
                                                style={{ width: 84 }}
                                                value={values[d.key]}
                                                onChange={(e) =>
                                                    setValues({ ...values, [d.key]: e.target.value.replace(/[^0-9]/g, '') })
                                                }
                                            />
                                        )}
                                        {d.kind === 'bool' && (
                                            <Toggle
                                                checked={values[d.key] === 'on'}
                                                onChange={(v) => setValues({ ...values, [d.key]: v ? 'on' : 'off' })}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                        <p className="muted" style={{ marginTop: 12 }}>
                            Advanced:{' '}
                            <button type="button" className="link" onClick={onShowJson}>
                                edit the raw profile JSON…
                            </button>
                        </p>
                    </div>
                    <div>
                        <h4>Live preview</h4>
                        {editor.preview ? (
                            <JspPreviewCode code={editor.preview} palette={palette} />
                        ) : (
                            <pre className="code-preview fmt-preview muted">Formatting…</pre>
                        )}
                    </div>
                </div>
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                    <button className="action" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="action primary" onClick={save}>
                        Save Options
                    </button>
                </div>
            </div>
        </div>
    );
}

const JSP_TOKEN_RE =
    /(<%@[\s\S]*?%>)|(<%=[\s\S]*?%>)|(<%[\s\S]*?%>)|(\$\{[^}\n]*\})|(<!--[\s\S]*?-->)|(<\/?[a-zA-Z][a-zA-Z0-9:_-]*|\/?>)/g;

function highlightJsp(code) {
    const out = [];
    let last = 0;
    JSP_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = JSP_TOKEN_RE.exec(code)) !== null) {
        if (m.index > last) {
            out.push({ type: 'plain', text: code.slice(last, m.index) });
        }
        const type = m[1] ? 'directive' : m[2] ? 'expression' : m[3] ? 'scriptlet' : m[4] ? 'el' : m[5] ? 'comment' : 'tag';
        out.push({ type, text: m[0] });
        last = m.index + m[0].length;
    }
    if (last < code.length) {
        out.push({ type: 'plain', text: code.slice(last) });
    }
    return out;
}

/** Formatted JSP preview, colored with the active scheme's JSP palette. */
function JspPreviewCode({ code, palette }) {
    const spans = useMemo(() => highlightJsp(code), [code]);
    const c = (key) => palette?.[key] ?? 'inherit';
    const colorFor = (type) =>
        type === 'directive' || type === 'scriptlet' || type === 'expression'
            ? c('keyword')
            : type === 'el'
              ? c('elExpression')
              : type === 'comment'
                ? c('comment')
                : type === 'tag'
                  ? palette?.htmlTag ?? c('keyword')
                  : 'inherit';
    return (
        <pre className="code-preview fmt-preview" style={{ color: c('foreground') }}>
            {spans.map((s, i) => (
                <span key={i} style={{ color: colorFor(s.type) }}>
                    {s.text}
                </span>
            ))}
        </pre>
    );
}
