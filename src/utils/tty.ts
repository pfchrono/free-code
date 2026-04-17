import { isatty } from 'node:tty';

type StandardTtyStream = (NodeJS.ReadStream | NodeJS.WriteStream) & {
  isTTY?: boolean;
};

function normalizeStreamIsTTY(stream: StandardTtyStream, fd: 0 | 1 | 2): void {
  if (stream.isTTY === true) {
    return;
  }

  stream.isTTY = isatty(fd);
}

export function normalizeStandardStreamTtyFlags(): void {
  // Bun on Windows can leave stdio `.isTTY` undefined or false even in real terminals.
  // Always probe with tty.isatty to get the real state.
  normalizeStreamIsTTY(process.stdin, 0);
  normalizeStreamIsTTY(process.stdout, 1);
  normalizeStreamIsTTY(process.stderr, 2);

  // On Windows PowerShell/Console, isatty() returns false even for interactive sessions.
  // If stdin or stderr is a TTY, assume interactive even if stdout reports false.
  // This handles the case where stdout is redirected but stdin/stderr are not.
  if (!process.stdout.isTTY && !process.stderr.isTTY && process.stdin.isTTY) {
    process.stdout.isTTY = true;
    process.stderr.isTTY = true;
  }
}
