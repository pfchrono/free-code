# Free-Code RTK Harness Integration Guide

This guide describes how to add transparent Rust Token Killer (`rtk`) support to Free-Code's shell/tool harness.

Goal:

```text
Free-Code decides to run:  git status
Harness rewrites to:       rtk git status
Tool executes:             rtk git status
Model receives:            compact token-efficient output
```

The integration should be implemented in the shell execution layer, not by asking the model to remember to type `rtk`.

---

## Why integrate at the harness level?

Prompt-level instructions like “use `rtk` for verbose commands” help, but they are unreliable. A harness-level rewrite gives Free-Code the same class of benefit as Claude Code/OpenCode hooks:

- no model compliance required
- works across all prompts and modes
- automatically picks up future RTK rewrite rules
- preserves raw command compatibility for unsupported commands
- reduces token use for common commands such as `git diff`, `cargo test`, `bun test`, `pytest`, `turbo build`, `uv run pytest`, etc.

RTK already centralizes rewrite logic in:

```bash
rtk rewrite "<command>"
```

So Free-Code should call that immediately before shell execution.

---

## Desired behavior

For every shell command Free-Code is about to execute:

```text
1. Receive original command string.
2. If RTK integration is disabled, execute original command unchanged.
3. If command already starts with `rtk`, execute unchanged.
4. Call `rtk rewrite <original command>`.
5. If RTK returns a rewritten command, execute the rewritten command.
6. If RTK returns no rewrite, exits non-zero, is missing, times out, or errors, execute original command unchanged.
7. Preserve cwd, env, stdin/stdout/stderr handling, exit code semantics, permissions, cancellation, and logging behavior.
```

This must be a safe optimization layer, never a reason shell execution fails.

---

## Recommended enablement model

Gate the behavior behind an environment variable first:

```bash
FREE_CODE_RTK=1
```

Optional future config names:

```text
shell.rtk.enabled = true
shell.rtk.binary = "rtk"
shell.rtk.timeoutMs = 750
shell.rtk.logRewrites = true
```

Initial default recommendation:

```text
FREE_CODE_RTK unset/false -> disabled
FREE_CODE_RTK=1/true/yes  -> enabled
```

Keep the first implementation conservative. Once stable, Free-Code can decide whether to make it default-on when `rtk` is available.

---

## Where to integrate

Find the central shell command execution path, likely near files such as:

```text
src/utils/Shell.ts
src/utils/shell/*
src/tools/*Shell*
src/tools/*Bash*
```

The correct insertion point is immediately after Free-Code has:

- constructed the final command string
- resolved cwd/env/permission approval
- before spawning the shell process

Do **not** integrate only in the CLI entrypoint. The rewrite should apply wherever the harness executes shell commands, including interactive mode, non-interactive `-p`, and headless transport sessions.

---

## Core implementation pattern

Create a small helper module rather than embedding RTK logic directly in the shell executor.

Suggested file:

```text
src/utils/shell/rtkRewrite.ts
```

Example implementation:

```ts
import { execa } from 'execa'

export type RtkRewriteOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  rtkBinary?: string
  enabled?: boolean
  debug?: boolean
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export function isRtkRewriteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthy(env.FREE_CODE_RTK)
}

export async function rewriteWithRtk(command: string, options: RtkRewriteOptions = {}): Promise<string> {
  const enabled = options.enabled ?? isRtkRewriteEnabled(options.env)
  if (!enabled) return command

  const trimmed = command.trim()
  if (!trimmed) return command
  if (trimmed === 'rtk' || trimmed.startsWith('rtk ')) return command
  if (trimmed.includes('\n')) return command // avoid heredocs/multiline surprises in v1

  const rtkBinary = options.rtkBinary ?? options.env?.FREE_CODE_RTK_BINARY ?? 'rtk'
  const timeoutMs = options.timeoutMs ?? 750

  try {
    const result = await execa(rtkBinary, ['rewrite', command], {
      cwd: options.cwd,
      env: options.env,
      reject: false,
      timeout: timeoutMs,
      stdin: 'ignore',
    })

    const rewritten = result.stdout.trim()
    if (result.exitCode === 0 && rewritten && rewritten !== command) {
      if (options.debug || isTruthy(options.env?.FREE_CODE_RTK_DEBUG)) {
        // Use Free-Code's normal debug logger if available.
        console.error(`[rtk] ${command} -> ${rewritten}`)
      }
      return rewritten
    }
  } catch {
    // Missing rtk, timeout, bad PATH, or any unexpected issue must not break shell execution.
  }

  return command
}
```

Notes:

- Use `execa` or the repo’s existing process helper.
- Use an argv array: `['rewrite', command]`. Do not shell-escape manually.
- Do not pipe user stdin into `rtk rewrite`.
- Set a short timeout. RTK rewrite should be very fast; a hung RTK must not block shell execution.
- In v1, skip multiline commands. RTK handles many shell constructs, but avoiding multiline/heredoc commands is safer for initial rollout.

---

## Hooking into shell execution

In the central shell executor, adapt this shape:

```ts
import { rewriteWithRtk } from './shell/rtkRewrite.js'

async function runShellCommand(command: string, options: ShellExecutionOptions): Promise<ShellExecutionResult> {
  const commandToExecute = await rewriteWithRtk(command, {
    cwd: options.cwd,
    env: options.env,
    timeoutMs: 750,
  })

  return runActualShellCommand(commandToExecute, options)
}
```

Critical preservation requirements:

- Execute in the same `cwd` as the original command.
- Pass the same environment that the actual command will receive.
- Preserve permission decisions: approval should still be associated with the user-requested command and/or display both original and rewritten command.
- Preserve cancellation/abort signals for the real command.
- Preserve exit code reporting from the real command, not from `rtk rewrite`.
- Do not change stdout/stderr streaming behavior except through RTK’s filtered command output.

---

## Permission UX recommendation

If Free-Code has a permission prompt before executing shell commands, avoid surprising the user.

Recommended prompt/display behavior:

```text
Command requested:
  git status

RTK rewrite:
  rtk git status
```

Then execute the rewritten command if approved.

If permission matching is rule-based, decide explicitly whether rules match:

1. original command only,
2. rewritten command only, or
3. both.

Recommended safe default:

```text
Permission checks evaluate the original command.
The execution log shows both original and rewritten command when they differ.
```

Reason: RTK rewrite should be an optimization of the requested command, not a new model-requested action.

---

## Logging recommendation

Normal UI should stay quiet. Debug logs are enough.

When `FREE_CODE_RTK_DEBUG=1`, log:

```text
[rtk] git status -> rtk git status
[rtk] uv run pytest tests -> rtk pytest tests
[rtk] tauri build -> rtk proxy tauri build
```

Also useful in debug mode:

```text
[rtk] no rewrite: echo hello
[rtk] unavailable, using original command
[rtk] rewrite timed out after 750ms, using original command
```

Do not show debug logs in normal model-facing output unless Free-Code already exposes debug output separately.

---

## Important command examples

These should rewrite with a current RTK binary:

```bash
rtk rewrite "git status"
# rtk git status

rtk rewrite "git diff"
# rtk git diff

rtk rewrite "cargo test --all"
# rtk cargo test --all

rtk rewrite "bun test"
# rtk bun test

rtk rewrite "bunx tsc --noEmit -p tsconfig.json"
# rtk tsc --noEmit -p tsconfig.json

rtk rewrite "uv run pytest tests"
# rtk pytest tests

rtk rewrite "python -m ruff check ."
# rtk ruff check .

rtk rewrite "turbo build"
# rtk turbo build

rtk rewrite "tauri build"
# rtk proxy tauri build

rtk rewrite "bunx tauri build"
# rtk proxy bunx tauri build
```

Unsupported commands should produce no rewrite and must execute unchanged:

```bash
rtk rewrite "echo hello"
# no stdout, non-zero exit
```

---

## Tests to add

Use Bun tests and test the helper independently from the real shell executor.

Suggested test file:

```text
src/utils/shell/rtkRewrite.test.ts
```

Test cases:

### Disabled by default

```ts
it('returns original command when disabled', async () => {
  const result = await rewriteWithRtk('git status', {
    enabled: false,
    env: {},
  })
  expect(result).toBe('git status')
})
```

### Rewrites when enabled

Mock the process runner or provide an injectable runner:

```ts
it('returns rewritten command when rtk provides one', async () => {
  const result = await rewriteWithRtk('git status', {
    enabled: true,
    // inject fake runner returning stdout: 'rtk git status\n', exitCode: 0
  })
  expect(result).toBe('rtk git status')
})
```

### No rewrite fallback

```ts
it('returns original command when rtk returns non-zero', async () => {
  // fake rtk exitCode: 1, stdout: ''
  expect(result).toBe('echo hello')
})
```

### Missing RTK fallback

```ts
it('returns original command when rtk is missing', async () => {
  // fake runner throws ENOENT
  expect(result).toBe('git status')
})
```

### Already RTK

```ts
it('does not rewrite commands already using rtk', async () => {
  expect(await rewriteWithRtk('rtk git status', { enabled: true })).toBe('rtk git status')
})
```

### Multiline commands skipped initially

```ts
it('does not rewrite multiline commands', async () => {
  const command = "cat <<'EOF'\nhello\nEOF"
  expect(await rewriteWithRtk(command, { enabled: true })).toBe(command)
})
```

### Integration test at shell executor level

Use a fake RTK binary on PATH or an injected `rtkBinary` path that prints a rewrite:

```bash
#!/usr/bin/env bash
if [ "$1" = "rewrite" ] && [ "$2" = "git status" ]; then
  echo "rtk git status"
  exit 0
fi
exit 1
```

Then assert that the shell executor executes the rewritten command while preserving cwd/env.

---

## Validation commands

After implementation:

```bash
cd /home/pfchrono/code/free-code
bun test src/utils/shell/rtkRewrite.test.ts
bun test
bun run build
```

Manual smoke test with a real RTK binary:

```bash
cd /home/pfchrono/code/free-code
FREE_CODE_RTK=1 FREE_CODE_RTK_DEBUG=1 bun run dev
```

Ask Free-Code to run or inspect commands that should rewrite:

```text
Run git status and then run uv run pytest tests --help.
```

Expected debug behavior:

```text
[rtk] git status -> rtk git status
[rtk] uv run pytest tests --help -> rtk pytest tests --help
```

---

## Rollout plan

1. Add `rewriteWithRtk()` helper with tests.
2. Wire it into the central shell executor behind `FREE_CODE_RTK=1`.
3. Add debug logging behind `FREE_CODE_RTK_DEBUG=1`.
4. Add one shell-executor integration test with a fake RTK binary.
5. Smoke test in non-interactive mode:

   ```bash
   FREE_CODE_RTK=1 printf '%s\n' 'Run git status.' | free-code -p --output-format text --permission-mode dontAsk --add-dir "$PWD"
   ```

6. Smoke test headless transport mode:

   ```bash
   FREE_CODE_RTK=1 bun run dev:headless-transport
   ```

7. Once stable, decide whether RTK should be default-on when `rtk` is present.

---

## Pitfalls

- Do not make RTK required. Missing RTK must be a no-op.
- Do not use shell string interpolation to call `rtk rewrite`; pass argv directly.
- Do not rewrite multiline/heredoc commands in the first version.
- Do not run permission checks only against the rewritten command without considering the original command.
- Do not lose cwd/env when calling `rtk rewrite`; RTK may need PATH from the same environment.
- Do not let RTK timeout or failure block command execution.
- Do not rewrite a command already starting with `rtk`.

---

## Summary

The minimal robust integration is:

```text
if FREE_CODE_RTK=1:
  command = await rewriteWithRtk(command)
execute command normally
```

This lets Free-Code automatically benefit from RTK’s expanding command registry while keeping shell execution safe and compatible.
