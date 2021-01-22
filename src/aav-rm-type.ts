import * as commander from 'commander';
import { Synchronizer } from './synchronizer';

const sync = Synchronizer.create();

commander.program.action(() => sync.deleteType());

commander.program.parse(process.argv);
