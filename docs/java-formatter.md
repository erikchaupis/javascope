# Java Formatter Guide

JavaScope's Java formatter **is** the Eclipse JDT formatter: a headless CLI
(`formatters/java/bin/javascope-jdt-formatter.jar`) built from
`org.eclipse.jdt.core` 3.42 runs the real `CodeFormatter` with your Eclipse
profile. No re-implementation, no regex tricks.

## Requirements

- `java` on PATH (JDK 17+ recommended; any modern JVM works).
- The bundled JAR ships inside the extension — nothing else to install.

If Java is missing, the Administration panel shows the runtime as unavailable
and Java formatting commands report an error; themes and JSP structural
formatting keep working.

## Profiles

| Profile | ID | Origin |
|---|---|---|
| Eclipse [built-in] | `builtin:java:eclipse-default` | built-in, read-only, **active by default** |

The Administration panel manages profiles Eclipse-style: pick the active one
in the profile dropdown, and use **New…** (initialize from the Eclipse
built-in or any existing profile), **Edit…**, **Rename…**, **Remove** and
**Import…/Export…** next to it. Profiles created in the panel are **global by
default** (`~/.javascope/formatters/java/`) so they can be reused in every
project; choose *Workspace* in the New-profile dialog to scope one to the
current project instead.

You can also drop Eclipse `.xml` files directly under `formatters/java/` in
either `.javascope` directory. A profile is any Eclipse
*CodeFormatterProfile* export:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<profiles version="21">
  <profile kind="CodeFormatterProfile" name="company" version="21">
    <setting id="org.eclipse.jdt.core.formatter.tabulation.char" value="space"/>
    <setting id="org.eclipse.jdt.core.formatter.tabulation.size" value="4"/>
    ...
  </profile>
</profiles>
```

Multi-profile files are supported; JavaScope uses the profile matching the
file name (or the first one).

**Export from Eclipse:** *Window → Preferences → Java → Code Style →
Formatter → Export…*, then *Administration → Java Formatter → Import…*.

Workspace profiles override user profiles with the same name. Built-in
profiles cannot be edited or deleted — duplicate them instead.

## Rule coverage

Everything Eclipse JDT supports is honored, including: indentation (tab/space
+ size), line width, brace positions (same line / next line), blank lines,
line wrapping, white space around operators/parentheses, import organization
settings, annotation layout, comment formatting, and member ordering options.

## Usage

- **Manual:** `JavaScope: Format Java Document` (`Ctrl/Cmd+Alt+F` in Java files).
- **On save:** enable *Format on save* in the Administration panel
  (`javascope.javaFormatter.formatOnSave`).
- **Toggle:** `JavaScope: Toggle Java Formatter` — independent of the JSP
  formatter and themes.

> Note: if another extension (e.g. the Red Hat Java extension with its own
> formatter enabled) also formats on save, VS Code may run both. Pick one
> formatter for on-save use, or invoke JavaScope explicitly.

## Idempotency

Formatting is idempotent: running the formatter twice produces identical
output (verified by automated tests).
