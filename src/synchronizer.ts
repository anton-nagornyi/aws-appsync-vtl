import {
  access, mkdir, readdir, readFile, writeFile, rm, rmdir,
} from 'fs/promises';
import Path from 'path';
import inquirer from 'inquirer';
import {
  AppSyncClient,
  CreateResolverCommand, CreateResolverResponse, DeleteResolverCommand, ListDataSourcesCommand, ListDataSourcesResponse,
  ListResolversCommand, Resolver,
  UpdateResolverCommand,
} from '@aws-sdk/client-appsync';

type SynchronizerConfig = {
  apiId: string,
  resolversPath: string,
};

export class Synchronizer {
  constructor(config: SynchronizerConfig) {
    this.apiId = config.apiId;
    this.resolversPath = config.resolversPath;
    this.appSync = new AppSyncClient({});
    this.appSync.middlewareStack.add(
      (next) => async (args: any) => {
        // eslint-disable-next-line no-param-reassign
        args.request.path = `/v1${args.request.path}`;
        return next(args);
      },
      { name: 'path fixup', step: 'build', priority: 'high' },
    );
  }

  private readonly apiId: string;

  private readonly resolversPath: string;

  private readonly appSync: AppSyncClient;

  static create = () => {
    // eslint-disable-next-line global-require
    const dotenv = require('dotenv');
    dotenv.config();

    if (!process.env.API_ID) {
      throw new Error('process.env.API_ID must be set');
    }

    if (!process.env.RESOLVERS_PATH) {
      throw new Error('process.env.RESOLVERS_PATH must be set');
    }

    return new Synchronizer({
      apiId: process.env.API_ID,
      resolversPath: process.env.RESOLVERS_PATH,
    });
  };

  pull = async (alwaysYes = false) => {
    this.createIfMissing(this.resolversPath);

    const { resolvers } = await this.appSync.send(new ListResolversCommand({
      apiId: this.apiId,
      typeName: 'Query',
    }));

    if (resolvers) {
      for (const resolver of resolvers) {
        this.pullResolver(resolver, alwaysYes);
      }
    }
  };

  deleteType = async () => {
    const typeNames = await readdir(this.resolversPath);
    if (typeNames.length === 0) {
      console.log('Nothing to do');
      return;
    }
    const { selection } = await inquirer.prompt([
      {
        name: 'selection',
        type: 'checkbox',
        message: 'Choose type',
        choices: typeNames,
      },
    ]);

    for (const type of selection) {
      const typePath = Path.join(this.resolversPath, type);
      const resolvers = await readdir(typePath);
      for (const resolver of resolvers) {
        await this.deleteResolverAt(type, resolver);
      }
      await rmdir(typePath);
      console.log(`Removed ${type}`);
    }
  };

  deleteResolver = async () => {
    const typeNames = await readdir(this.resolversPath);
    if (typeNames.length === 0) {
      console.log('Nothing to do');
      return;
    }
    const { type } = await inquirer.prompt([
      {
        name: 'type',
        type: 'list',
        message: 'Choose type',
        choices: typeNames,
      },
    ]);

    const typePath = Path.join(this.resolversPath, type);
    const resolvers = await readdir(typePath);
    if (resolvers.length === 0) {
      console.log(`No resolvers for the ${type} found`);
      return;
    }

    const { resolverSelections } = await inquirer.prompt([
      {
        name: 'resolverSelections',
        type: 'checkbox',
        message: 'Choose type',
        choices: resolvers,
      },
    ]);

    for (const resolver of resolverSelections) {
      await this.deleteResolverAt(type, resolver);
    }
  };

  private deleteResolverAt = async (type: string, resolver: string) => {
    const resolverPath = Path.join(this.resolversPath, type, resolver);
    const metaPath = Path.join(resolverPath, 'meta.json');
    const meta = await this.exists(metaPath)
      ? JSON.parse(await readFile(metaPath, 'utf-8')) as CreateResolverResponse['resolver']
      : undefined;
    if (meta) {
      await this.appSync.send(new DeleteResolverCommand({
        apiId: this.apiId,
        typeName: type,
        fieldName: resolver,
      }));
    }
    await rm(resolverPath, { recursive: true });
    console.log(`Removed ${type}.${resolver}`);
  };

  push = async () => {
    const typeNames = await readdir(this.resolversPath);
    const dataSources = (await this.getDataSources()).dataSources!.map((ds) => ds.name);

    for (const type of typeNames) {
      const typePath = Path.join(this.resolversPath, type);
      const fieldNames = await readdir(typePath);
      for (const fieldName of fieldNames) {
        const resolverPath = Path.join(typePath, fieldName);
        const metaPath = Path.join(resolverPath, 'meta.json');
        const requestPath = Path.join(resolverPath, 'request.vm');
        const responsePath = Path.join(resolverPath, 'response.vm');
        const responseTemplateExists = await this.exists(requestPath);
        const requestTemplateExists = await this.exists(requestPath);

        if (!requestTemplateExists && !responseTemplateExists) {
          // eslint-disable-next-line no-continue
          continue;
        }

        let ds = await this.exists(metaPath) ? JSON.parse(await readFile(metaPath, 'utf-8')).dataSourceName : '';

        const creating = !ds;
        const info = creating ? 'Creating' : 'Updating';

        if (creating) {
          ds = (await inquirer.prompt([
            {
              name: 'ds',
              type: 'list',
              message: `Please set data source for ${type}.${fieldName}`,
              choices: dataSources,
            },
          ])).ds;
        }

        console.log(`${info} resolver: ${type}.${fieldName}`);

        const requestMappingTemplate = await this.exists(requestPath) ? await readFile(requestPath, 'utf-8') : undefined;
        const responseMappingTemplate = await this.exists(responsePath) ? await readFile(responsePath, 'utf-8') : undefined;
        const input = {
          apiId: this.apiId,
          typeName: type,
          fieldName,
          dataSourceName: ds,
          requestMappingTemplate,
          responseMappingTemplate,
        };

        try {
          const resp = await this.appSync.send(creating
            ? new CreateResolverCommand(input)
            : new UpdateResolverCommand(input));

          await writeFile(metaPath, JSON.stringify(resp.resolver, null, 2));
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  private pullResolver = async (resolver: Resolver, alwaysYes: boolean) => {
    if (!resolver.requestMappingTemplate && !resolver.responseMappingTemplate) {
      // Nothing to do
      return;
    }
    console.log(`Processing resolver: ${resolver.typeName}.${resolver.fieldName}`);
    const resolverPath = Path.join(this.resolversPath, resolver.typeName!, resolver.fieldName!);

    await this.createIfMissing(resolverPath);

    if (resolver.requestMappingTemplate) {
      await this.processResolverTemplate(Path.join(resolverPath, 'request.vm'), resolver.requestMappingTemplate, alwaysYes);
    }
    if (resolver.responseMappingTemplate) {
      await this.processResolverTemplate(Path.join(resolverPath, 'response.vm'), resolver.responseMappingTemplate, alwaysYes);
    }

    await writeFile(Path.join(resolverPath, 'meta.json'), JSON.stringify(resolver, null, 2));
  };

  private processResolverTemplate = async (templatePath: string, template: string, alwaysYes: boolean) => {
    const exists = await this.exists(templatePath);

    if (exists && !alwaysYes) {
      const choice = await inquirer.prompt([
        {
          name: 'override',
          type: 'list',
          message: `Template ${templatePath} already exists. Would you like to override it?`,
          choices: [
            'Yes', 'No',
          ],
        },
      ]);
      if (choice.override === 'No') {
        return;
      }
    }

    await writeFile(templatePath, template);
  };

  private getDataSources = async (): Promise<ListDataSourcesResponse> => this.appSync.send(new ListDataSourcesCommand({
    apiId: this.apiId,
  }));

  private exists = async (path: string): Promise<boolean> => {
    try {
      await access(path);
    } catch (e) {
      if (e.code === 'ENOENT') {
        return false;
      }
      throw e;
    }
    return true;
  };

  private createIfMissing = async (path: string): Promise<boolean> => {
    try {
      await access(path);
    } catch (e) {
      if (e.code === 'ENOENT') {
        await mkdir(path, { recursive: true });
        return true;
      }
      throw e;
    }
    return false;
  };
}
