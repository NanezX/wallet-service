import { existsSync } from 'node:fs';

import type { SignOptions } from 'jsonwebtoken';

import { generateAccessToken } from '../src/auth/access-token';

type CliOptions = {
  userId?: string;
  expiresIn: string;
  raw: boolean;
  secret?: string;
};

function printUsage(): never {
  console.error('Usage: npm run generate-token -- [user-id] [--expires-in 1h] [--raw] [--secret value]');
  process.exit(1);
}

function loadEnvFileIfPresent(): void {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}

function readOptionValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];

  if (value === undefined || value.startsWith('--')) {
    console.error(`Missing value for ${flag}`);
    printUsage();
  }

  return value;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    expiresIn: '1h',
    raw: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--expires-in') {
      options.expiresIn = readOptionValue(args, index, argument);
      index += 1;
      continue;
    }

    if (argument === '--secret') {
      options.secret = readOptionValue(args, index, argument);
      index += 1;
      continue;
    }

    if (argument === '--raw') {
      options.raw = true;
      continue;
    }

    if (argument.startsWith('--')) {
      console.error(`Unknown option: ${argument}`);
      printUsage();
    }

    if (options.userId !== undefined) {
      console.error('Only one user id can be provided');
      printUsage();
    }

    options.userId = argument;
  }

  return options;
}

function main(): void {
  loadEnvFileIfPresent();

  const options = parseArgs(process.argv.slice(2));
  const secret = options.secret ?? process.env.JWT_SECRET;

  if (!secret?.trim()) {
    console.error('JWT_SECRET is required. Set it in .env, export it in the shell, or pass --secret.');
    process.exit(1);
  }

  try {
    const result = generateAccessToken({
      secret,
      userId: options.userId,
      expiresIn: options.expiresIn as SignOptions['expiresIn'],
    });

    if (options.raw) {
      console.log(result.token);
      return;
    }

    console.log(`User ID: ${result.userId}`);
    console.log(`Expires In: ${options.expiresIn}`);
    console.log(`Token: ${result.token}`);
    console.log(`Authorization: ${result.authorizationHeader}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate token';

    console.error(message);
    process.exit(1);
  }
}

main();