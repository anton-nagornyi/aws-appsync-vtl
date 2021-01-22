import * as commander from 'commander';

commander.program.command('type', 'Remove a type');
commander.program.command('resolver', 'Remove a resolver');

commander.program.parse(process.argv);
