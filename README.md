# VSKathará

VS Code extension for [Kathará](https://github.com/KatharaFramework/Kathara) network labs syntax highlighting, autocompletion, linting, topology view, and terminal commands.

---

## Features

### Syntax Highlighting
Full grammar support for all Kathará lab files:
- `lab.conf` — devices, interfaces, options, collision domains, MAC addresses, metadata keys
- `lab.dep` — startup dependency rules
- `lab.ext` — external network mappings
- `*.startup` — reuses the built-in shell grammar

### Autocompletion (`lab.conf`)
- All 16 device option names (`image`, `mem`, `port`, `sysctl`, `exec`, `volume`…) with descriptions inside `device[…]`
- Boolean suggestions (`true`/`false`) after `=` for `bridged`, `ipv6`, `privileged`
- Protocol suggestions (`tcp`, `udp`, `sctp`) inside `port` values
- Volume mode suggestions (`ro`, `rw`, `rx`)
- Common shell paths for `shell`
- Common `net.*` sysctl values
- `LAB_*` metadata key snippets
- Reuses Docker image names already present in the file

### Hover Documentation
Hover over any option name (e.g. `sysctl`, `mem`, `volume`) to see its type, description, constraints, and an inline example.

### Linting / Diagnostics
Errors and warnings are shown inline as you type:

| Rule | Severity |
|---|---|
| Interface indices must be sequential from 0 per device | Error |
| Collision domain names must not contain spaces, commas, or dots | Error |
| MAC address must match `XX:XX:XX:XX:XX:XX` | Error |
| `mem` must use a valid suffix (`b`/`k`/`m`/`g`) and be ≥ 4m | Error |
| `port` must match `[HOST:]GUEST[/tcp\|udp\|sctp]` | Error |
| `sysctl` values must start with `net.` | Error |
| `env` must be `KEY=VALUE` | Error |
| `volume` must use `\|` separators with optional `ro`/`rw`/`rx` mode | Error |
| VLAN IDs 0 and 4095 are reserved (`lab.ext`) | Error |
| Boolean options must be `true` or `false` | Error |
| Unknown option name | Warning |
| Device names in `lab.dep` / `.startup` not declared in `lab.conf` | Warning |

### Topology View
Run **Kathará: Show Topology** (or click the icon in the `lab.conf` editor title bar) to open an interactive network graph:
- Device shapes are inferred from host name prefixes:
	- `pc*` → **PC** shape (monitor)
	- `lt*` → **Laptop** shape
	- `r*` → **Router** shape
	- `server*` → **Server** shape
	- other names → generic device shape
- Collision domains are shown as **ellipses**
- Force-directed layout, auto-fits to window on load
- **Scroll** to zoom · **Drag canvas** to pan · **Drag nodes** to reposition · **Double-click** canvas to reset view
- Colors adapt automatically to any VS Code theme
- Auto-refreshes when `lab.conf` is edited

### Kathará Commands
All commands are available via the Command Palette (`Ctrl+Shift+P`) and in the Explorer context menu on `lab.conf`:

| Command | Action |
|---|---|
| `Kathará: Start Lab` | Runs `kathara lstart` in the lab directory |
| `Kathará: Stop Lab` | Runs `kathara lclean` |
| `Kathará: Restart Lab` | Runs `Kathará lrestart` |
| `Kathará: Lab Info` | Runs `Kathará linfo` |
| `Kathará: Connect to Device` | Device picker → `Kathará connect <device>` |
| `Kathará: Start Device` | Device picker → `Kathará vstart <device>` |
| `Kathará: Show Topology` | Opens the topology WebView |

---

## Requirements

- [Kathará](https://github.com/KatharáFramework/Kathará) installed and available on `PATH`
- VS Code `^1.85.0`

---

## Development Setup

**Prerequisites:**
- [Node.js](https://nodejs.org/) LTS (includes npm)
- Git
- VS Code

### OS-specific notes
The extension should work for every OS version of VSCode, command will work if the katharà environment is setup correctly, the development workflow (`npm install`, `npm run build:dev`, `npm run watch`, `npm run compile`) works on  every OS as long as `node`/`npm` are in `PATH`.

```bash
git clone https://github.com/antoniocariaa/VSKathará
cd VSKathará
npm install
npm run build:dev
```

Then press **F5** in VS Code to launch the Extension Development Host.

### Available scripts

| Script | Description |
|---|---|
| `npm run doctor` | Check local environment (Node/npm/Git/VS Code/Kathará) |
| `npm run build:dev` | Bundle with source maps (development) |
| `npm run build` | Minified production bundle |
| `npm run watch` | Rebuild on file changes |
| `npm run compile` | Type-check only (no output) |
| `npm run lint` | ESLint |

VS Code tasks for all of the above are in `.vscode/tasks.json` (**Terminal → Run Task**).

---

## Lab Format Quick Reference

See the [Kathará Lab Format wiki](https://github.com/KatharáFramework/Kathará/wiki/Kathará-Lab-Format) for the full spec.

**`lab.conf`** — main topology file:
```
LAB_NAME="My Lab"

r1[0]="A"
r1[1]="B"
r1[image]="Kathará/frr"
r1[sysctl]="net.ipv4.ip_forward=1"
r1[mem]="128m"

pc1[0]="A"
pc2[0]="B"
```

**`r1.startup`** — shell script executed inside the device at boot:
```bash
ip addr add 10.0.0.1/24 dev eth0
ip route add default via 10.0.0.254
```

**`lab.dep`** — startup ordering:
```
pc1: r1
```

**`lab.ext`** — map a collision domain to a host interface (Linux/root only):
```
A enp9s0
B enp9s0.20
```

#### ToDO:
- show bridged devices in topology view (maybe as clouds around the host node?)
- more complete autocompletion (options inside `lab.ext` and `lab.dep`, metadata keys, etc.)
- hover docs for `lab.ext` and `lab.dep` options
- reload lab when lab.conf is saved outside of VS Code 