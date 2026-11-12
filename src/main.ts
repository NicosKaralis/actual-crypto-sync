import { argv, exit, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

export const USAGE = `Usage: actual-crypto-sync [--config <path>] [--dry-run] [--debug]

Keeps off-budget Actual Budget accounts in line with your crypto wallets.

Options:
  --config <path>  Config file (default: $CONFIG_FILE or /config/config.yml)
  --dry-run        Read everything and log the plan, write nothing to Actual
  --debug          Log every request's URL and status
  -h, --help       Show this help
`;

export function main(args: readonly string[]): number {
  if (args.includes('-h') || args.includes('--help')) {
    stdout.write(USAGE);
    return 0;
  }
  // The sync itself comes in later tasks; until then the CLI only prints its usage.
  stdout.write(USAGE);
  return 0;
}

if (import.meta.url === pathToFileURL(argv[1] ?? '').href) {
  exit(main(argv.slice(2)));
}
