# VSKathara Missing Tests

Checklist of test coverage gaps, organized by module. Existing coverage is noted at the top of each section for context (Claude Analysis).

## `diagnosticsProvider.ts` high priority (core UX, currently only 1 aggregate test)

Currently there's only one test that checks "at least 9 errors" against the `test-linting` fixture. Needs isolated, targeted tests instead:

- [ ] Each `lab.conf` rule tested in isolation, not just the aggregate count: out-of-sequence interface index, collision domain with dot/comma/space, invalid MAC, `mem` below 4m, `mem` with invalid suffix, malformed `port`, `sysctl` outside `net.*`, `env` without `=`, `volume` without `|`, boolean option not true/false, unknown option (warning), negative/non-numeric `cpus`, non-integer `num_terms`
- [ ] Happy path: a valid `lab.conf` produces **zero** diagnostics (today only the error case is tested)
- [ ] `lab.dep` diagnostics: device not declared in `lab.conf`, dependency not declared, line without `:`
- [ ] `lab.ext` diagnostics: reserved VLAN IDs 0/4095, VLAN out of range 1-4094, invalid collision domain
- [ ] Behavior when `lab.dep`/`lab.ext` exist but the associated `lab.conf` doesn't (`getDevicesFromLabConf` → null): diagnostics about unknown devices should be suppressed, not produce false positives
- [ ] Diagnostics update after an edit (`onDidChangeTextDocument`), not just on open
- [ ] Diagnostics are cleared when the document closes (`onDidCloseTextDocument`)

## `completionProvider.ts`

Currently covered: option names, booleans, port protocol, `LAB_*` keys.

- [ ] Volume mode (`ro`/`rw`/`rx`) after the second `|`
- [ ] Shell suggestions (`/bin/bash`, `/bin/sh`, etc.)
- [ ] Common sysctl values
- [ ] Docker image suggestions, including ones already present in the file (dedup against defaults)
- [ ] Device completion in `lab.dep` (before and after `:`)
- [ ] Collision domain and network interface completion in `lab.ext`
- [ ] Behavior with no associated `lab.conf` (no crash, no device suggestions)

## `hoverProvider.ts`

Currently covered: `mem` option, `LAB_NAME` key, no hover on an unknown option.

- [ ] Hover on the device name at the start of a line
- [ ] Coverage of all 16 options, not just `mem` (at minimum, verify every option has an entry in `OPTION_DOCS`)
- [ ] Hover just outside the range (right before/after the bracket) → no hover
- [ ] Coverage of the other 5 `LAB_*` keys, not just `LAB_NAME`

## `labUtils.ts` zero coverage

- [ ] `getDevicesFromLabConf`: correctly reads devices from a real `lab.conf` on disk
- [ ] `getDevicesFromLabConf`: returns `null` when `lab.conf` doesn't exist
- [ ] `getCollisionDomainsFromLabConf`: extracts collision domains, including the MAC case (cut after `/`)
- [ ] `getCollisionDomainsFromLabConf`: returns `null` when `lab.conf` doesn't exist

## `katharaCommands.ts` zero coverage

- [ ] `resolveLabDir`: prefers the active editor's directory when it's a `lab.conf`
- [ ] `resolveLabDir`: falls back to `workspace.findFiles` when no `lab.conf` is active
- [ ] `resolveLabDir`: falls back to the workspace root when no `lab.conf` is found
- [ ] `cmdLstart`/`cmdLclean`/`cmdLrestart`/`cmdLinfo`: show `showErrorMessage` when no lab directory is found
- [ ] `registerCommands`: all `kathara.*` commands are actually registered (checkable via `vscode.commands.getCommands()`)
- [ ] `cmdConnect`/`cmdVstart` (more involved: depend on `showQuickPick`/`showInputBox` — figuring out how to drive those pickers in tests may be worth deferring)

## `topologyView.ts` zero coverage, needs a small refactor

- [ ] `getDeviceKind` and `buildTopology` are pure logic but **not exported** — export them to unit-test as fast, non-integration tests (`pc*`→pc, `lt*`→laptop, `r*`→router, `server*`→server, other→device; `buildTopology` produces correct edges/domains from a `LabConfDocument`)
- [ ] Integration test: the `kathara.showTopology` command opens a webview panel without throwing

## `extension.ts` zero coverage

- [ ] `activate()`: all providers and commands are registered after activation
- [ ] The extension activates when the workspace contains a `lab.conf` (checkable via `vscode.extensions.getExtension(...).isActive`)

---

**Suggested approach:** tackle these in small batches (e.g. all `diagnosticsProvider` rules first, then `labUtils`, etc.) to keep PRs small and reviewable.