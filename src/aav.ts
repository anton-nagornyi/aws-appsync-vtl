import dotenv from 'dotenv';
import commander from 'commander';
import { Synchronizer } from './synchronizer';

const sync = Synchronizer.create();

commander.program
  .command('pull')
  .option('-y', 'Automatic yes to prompts. Assume "yes" as answer to all prompts and run non-interactively')
  .action((options) => sync.pull(options.y));
commander.program
  .command('push')
  .option('-y', 'Automatic yes to prompts. Assume "yes" as answer to all prompts and run non-interactively')
  .action(() => sync.push());

commander.program.command('rm', 'Remove type or resolver', { executableFile: `${__dirname}/aav-rm` });

commander.parse(process.argv);
