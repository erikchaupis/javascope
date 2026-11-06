# Workspace Sharing Guide

JavaScope is designed for teams: commit a `.javascope` directory to your
repository and every developer gets the same colors and formatting rules the
moment they open the project.

## Setup

1. Open your project in VS Code.
2. Open **JavaScope Administration** → **General**.
3. Set *Configuration location* to **Workspace** (or keep *Auto* — it uses the
   workspace whenever a folder is open).
4. Configure themes and formatters in the Administration panel.
5. Commit the `.javascope` folder:

```bash
git add .javascope
git commit -m "Share JavaScope configuration"
```

Typical committed layout:

```
.javascope/
├── settings.json                    # active theme, toggles, active profiles
├── themes/
│   └── team-theme.json              # optional custom scheme
└── formatters/
    ├── java/
    │   └── company-style.xml        # Eclipse profile exported from the IDE
    └── jsp/
        └── team-style.json
```

Add to `.gitignore` only what you don't want shared (usually nothing).

## What teammates get

- The same **active color scheme** (built-in or your custom theme).
- The same **Java formatter profile** — any Eclipse XML profile works, no
  Eclipse installation required.
- The same **JSP formatting rules** and feature toggles.
- Profiles and themes added to `.javascope` later are picked up automatically
  (directories are watched).

## Layering for individuals

A developer's personal `~/.javascope/settings.json` still applies — but the
workspace file wins per key. To opt out of a shared choice, a developer can
set the corresponding VS Code user setting `javascope.*`, or remove the key
from the workspace file (workspace file is authoritative).

Profiles created from the Administration panel are global (`~/.javascope`) by
default and travel with the developer across projects; only profiles
explicitly saved to *Workspace* become part of the shared `.javascope`
folder. A workspace profile overrides a global one with the same name.

## Security notes

- The workspace `.javascope` folder is **untrusted data**: it is parsed and
  validated, never executed.
- Invalid files are ignored with visible errors — a broken commit cannot
  break formatting for the whole team.
