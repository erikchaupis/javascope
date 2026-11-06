# Configuration Reference

JavaScope reads configuration from four layers, highest precedence first:

1. **Workspace `.javascope/settings.json`** — `<workspace-root>/.javascope/settings.json`
2. **User `~/.javascope/settings.json`**
3. **VS Code settings** — `javascope.*` (workspace overrides user)
4. **Built-in defaults**

The Administration panel shows the effective value **and the origin** of every setting.

## Settings file format

`.javascope/settings.json`:

```jsonc
{
  "version": 1,
  "enabled": true,                        // master switch
  "configurationLocation": "auto",        // auto | user | workspace

  "themes": {
    "enabled": true,
    "active": "eclipse-light"             // builtin id or custom:<origin>:<name>
  },

  "javaFormatter": {
    "enabled": true,
    "activeProfile": "builtin:java:eclipse-default",
    "formatOnSave": false
  },

  "jspFormatter": {
    "enabled": true,
    "activeProfile": "builtin:jsp:default",
    "formatOnSave": false
  }
}
```

Unknown keys are ignored (forward compatibility). Invalid files are reported as
problems in the Administration panel and skipped — they never crash the
extension.

## `configurationLocation`

Controls where the Administration panel and toggle commands **write** settings:

- `auto` (default): workspace `.javascope` when a folder is open (shareable via
  Git), otherwise the user folder.
- `user`: always `~/.javascope`.
- `workspace`: always `<workspace>/.javascope` (error if no folder is open).

Writing to one location never modifies the other.

## Directory layout

```
~/.javascope/                       <workspace>/.javascope/
├── settings.json                   ├── settings.json
├── themes/                         ├── themes/
│   └── my-theme.json               │   └── team-theme.json
└── formatters/                     └── formatters/
    ├── java/                           ├── java/
    │   ├── company-style.xml           │   └── company-style.xml
    └── jsp/                            └── jsp/
        └── company-style.json              └── team-style.json
```

## VS Code settings

All settings are also available as VS Code configuration keys, e.g.:

```jsonc
{
  "javascope.themes.active": "intellij-darcula",
  "javascope.javaFormatter.formatOnSave": true
}
```

The `.javascope/settings.json` layers override these, which override defaults.

## Discovery and watching

Both `.javascope` directories are watched. Manually added or edited
`settings.json`, theme files and formatter profiles are picked up within a
fraction of a second — no reload needed (`JavaScope: Reload Configuration`
forces a re-read).

## Security

- Workspace configuration is treated as **data, not code**: JSON/XML is parsed
  and validated, never executed. No configuration value can run scripts or
  commands.
- The Administration webview cannot supply arbitrary paths; file pickers are
  native OS dialogs driven by the extension host.
- Invalid profiles/themes are rejected with explicit error messages.
