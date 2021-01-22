import * as commander from 'commander';

commander.program.command('type', 'Remove a type', { executableFile: `${__dirname}/aav-rm-type` });
commander.program.command('resolver', 'Remove a resolver', { executableFile: `${__dirname}/aav-rm-resolver` });

commander.program.parse(process.argv);
