export interface Spinner {
  stop(): void;
}

export function startSpinner(label: string): Spinner {
  const start = Date.now();
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  process.stderr.write("\x1B[?25l"); // hide cursor

  const timer = setInterval(() => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    process.stderr.write(`\r${frames[i % frames.length]} ${label} ${elapsed}s`);
    i++;
  }, 100);

  return {
    stop() {
      clearInterval(timer);
      process.stderr.write("\r\x1B[2K"); // clear line
      process.stderr.write("\x1B[?25h"); // show cursor
    },
  };
}
