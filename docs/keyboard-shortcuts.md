# Keyboard Shortcuts Guide

## Bundled keybindings

JavaScope contributes two shortcuts, bound per language so they never
conflict with the built-in formatter:

| Shortcut | Command | When |
|---|---|---|
| `Ctrl+Alt+F` (`Cmd+Alt+F` on macOS) | JavaScope: Format Java | editor has focus, language is Java |
| `Ctrl+Alt+Shift+F` (`Cmd+Alt+Shift+F` on macOS) | JavaScope: Format Java Selection | editor has focus, language is Java, text is selected |
| `Ctrl+Alt+F` (`Cmd+Alt+F` on macOS) | JavaScope: Format JSP | editor has focus, language is JSP |

All three appear in the palette under the **JavaScope** category, in the
editor **right-click menu**, and as a **"Format Java" / "Format JSP" text
button** in the editor title bar (hover for the tooltip with the shortcut).
To hide the button: right-click the title bar and uncheck it — it moves to
the `…` overflow; recheck to restore — or set
`"javascope.showEditorActions": false` in your settings to remove it
entirely. Shortcuts and menus keep working either way. VS Code's standard
**Format Document** (`Shift+Alt+F`) is untouched and keeps its default
behavior.

## Customizing or removing

1. Open **File → Preferences → Keyboard Shortcuts** (`Cmd/Ctrl+K Cmd/Ctrl+S`).
2. Search for **"JavaScope"**.
3. Double-click a binding to change it, or right-click → **Remove Keybinding**.

JavaScope registers only its own commands' bindings and never modifies
unrelated shortcuts or settings.

## All commands (bindable like any other)

- `JavaScope: Open Administration` — `javascope.openAdmin`
- `JavaScope: Format Java Document` — `javascope.formatJava`
- `JavaScope: Format Java Selection` — `javascope.formatJavaSelection`
- `JavaScope: Format JSP Document` — `javascope.formatJsp`
- `JavaScope: Select Java Formatter Profile` — `javascope.selectJavaProfile`
- `JavaScope: Select JSP Formatter Profile` — `javascope.selectJspProfile`
- `JavaScope: Toggle Java Formatter` — `javascope.toggleJavaFormatter`
- `JavaScope: Toggle JSP Formatter` — `javascope.toggleJspFormatter`
- `JavaScope: Toggle JavaScope Themes` — `javascope.toggleThemes`
- `JavaScope: Reload Configuration` — `javascope.reloadConfiguration`
