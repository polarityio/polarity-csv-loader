const Polarity = require('polarity-node-rest-api');
const { getFilesToLoad, loadCsvIntoChannel, moveFile, cleanupOldFiles } = require('./lib/filesystem');
const Stopwatch = require('statman-stopwatch');
const path = require('path');

const stopwatch = new Stopwatch();
const Logger = require('./lib/logger');

const loadCmd = {
  command: 'load',
  desc: 'Load any CSV files',
  builder: (yargs) => {
    return yargs
      .option('username', {
        type: 'string',
        nargs: 1,
        describe: 'Username to login as'
      })
      .option('password', {
        type: 'string',
        nargs: 1,
        describe: 'Password for the given Polarity username'
      })
      .option('url', {
        type: 'string',
        demand: 'You must provide Polarity url to include schema (e.g., https://my.polarity.internal)',
        nargs: 1,
        describe: 'Polarity server url to include schema'
      })
      .option('directory', {
        type: 'string',
        demand: 'You must provide the "directory" to read CSV files from',
        nargs: 1,
        describe: 'Directory to read CSV files from'
      })
      .option('simulate', {
        type: 'boolean',
        default: false,
        describe:
          'If provided, the loader will log a preview of the actions it would take but no actions will be taken.'
      })
      .option('header', {
        type: 'boolean',
        default: false,
        describe: 'If provided, the loader will skip the first row in the CSV and treat it as a header'
      });
  },
  handler: async (argv) => {
    stopwatch.start();
    const { url, username: cliUsername, password: cliPassword, directory, simulate, header } = argv;

    let envUsername = process.env.POLARITY_USERNAME;
    let envPassword = process.env.POLARITY_PASSWORD;

    const username = envUsername ? envUsername : cliUsername;
    const password = envPassword ? envPassword : cliPassword;

    if (!username || !password) {
      Logger.error('You must provide a username and password');
      return;
    }

    Logger.info('Starting', { url, username, password: '**********', directory });
    const polarity = new Polarity(Logger);

    try {
      await polarity.connect({
        host: url,
        username: username,
        password: password,
        request: {
          rejectUnauthorized: false
        }
      });

      const files = await getFilesToLoad(polarity, directory);
      Logger.info('Files to Load', { files, elapsedTime: stopwatch.read() });

      for (const { channelId, channelName, filePath } of files) {
        try {
          if (!simulate) {
            const clearResult = await polarity.clearChannelById(channelId);
            Logger.info(`Finished clearing channel ${channelName}`, { clearResult, elapsedTime: stopwatch.read() });
          }
          await loadCsvIntoChannel(polarity, filePath, channelId, header, simulate);

          // Rename and move the file to a finished directory
          await moveFile(path.join(directory, 'completed'), filePath, simulate);
        } catch (fileLoadError) {
          Logger.error('Error loading file', { filePath, channelName, channelId });
          await moveFile(path.join(directory, 'failed'), filePath, simulate);
        }
      }
    } catch (e) {
      Logger.error('Error loading CSV files', e);
    } finally {
      const cleanupResult = await cleanupOldFiles(path.join(directory, 'completed'), simulate);
      Logger.info('Removed old completed files', { cleanupResult });
      Logger.info(`Total Run Time: ${stopwatch.read()}`);

      if (polarity && polarity.isConnected) {
        Logger.info('Disconnecting from Polarity');
        await polarity.disconnect();
      }
    }
  }
};

require('yargs')
  .usage('Usage: $0 <command> [options]')
  .command(loadCmd)
  .help()
  .wrap(null)
  .version('Polarity CSV Loader v' + require('./package.json').version)
  // help
  .epilog('(C) 2020 Polarity.io, Inc.').argv;
