const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const xbytes = require('xbytes');
const Papa = require('papaparse');
const Logger = require('./logger');

const readdir = util.promisify(fs.readdir);
const mkdir = util.promisify(fs.mkdir);
const rename = util.promisify(fs.rename);

const ENTITY_UPLOAD_BATCH_SIZE = 1000;

async function loadCsvIntoChannel(polarity, fileName, channelId, header, simulate) {
  let polarityEntities = [];
  let totalPolarityEntities = 0;
  const csv = fs.createReadStream(fileName, 'utf8');

  return new Promise((resolve, reject) => {
    Papa.parse(csv, {
      header: header,
      skipEmptyLines: true,
      delimiter: ',',
      step: async (results, parser) => {
        if (results.errors.length > 0) {
          Logger.error({ error: results.errors }, 'Error parsing file');
          return parser.abort();
        }

        polarityEntities.push(results.data);
        ++totalPolarityEntities;

        // We don't want to keep all the entities around since it could get pretty large
        // Instead, if we hit 1000 then we'll start to upload data to a Polarity channel
        if (polarityEntities.length >= ENTITY_UPLOAD_BATCH_SIZE) {
          try {
            parser.pause();
            //Logger.info('Polarity Entities', { polarityEntities });
            if (!simulate) {
              const result = await polarity.applyTags(polarityEntities, channelId);
              Logger.info(result);
              logMemoryUsage(totalPolarityEntities);
            }
          } catch (applyTagErr) {
            Logger.error('Polarity Apply Tags Error', applyTagErr);
          } finally {
            polarityEntities = [];
            parser.resume();
          }
        }
      },
      error: (results) => {
        Logger.error({ error: results.errors }, 'Error parsing Assets CSV File');
        reject(results.errors);
      },
      complete: async () => {
        try {
          if (polarityEntities.length > 0) {
            //Logger.info(polarityEntities);
            if (!simulate) {
              const result = await polarity.applyTags(polarityEntities, channelId);
              Logger.info(result);
            }
          }
        } catch (applyTagErr) {
          Logger.error('Polarity Apply Tags Error', applyTagErr);
          polarityEntities = [];
        }
        logMemoryUsage(totalPolarityEntities);
        resolve();
      }
    });
  });
}

async function cleanupOldFiles(directory, simulate) {
  return new Promise((resolve, reject) => {
    let rmCommand = `ls | sed -e '1,10d' | xargs -rd '\n' rm`;
    let simCommand = `ls | sed -e '1,10d' | xargs -rI file echo 'Cleaning up file'`;

    exec(simCommand, { cwd: directory }, (err, stdout, stderr) => {
      if (err) {
        reject(err);
        return;
      }

      if (stderr) {
        reject(stderr);
        return;
      }

      const removedFiles = stdout.split('\n').reduce((accum, file) => {
        if (file.length > 0) {
          accum.push(file);
        }
        return accum;
      }, []);

      if (simulate) {
        return resolve(removedFiles);
      } else {
        exec(rmCommand, { cwd: directory }, (err, stdout, stderr) => {
          if (err) {
            reject(err);
            return;
          }

          if (stderr) {
            reject(stderr);
            return;
          }

          resolve(removedFiles);
        });
      }
    });
  });
}

function logMemoryUsage(totalPolarityEntities) {
  const usedMemory = process.memoryUsage();
  const converted = {};
  for (let key in usedMemory) {
    converted[key] = xbytes(usedMemory[key]);
  }
  Logger.info({ memory: converted, totalPolarityEntities: totalPolarityEntities }, 'Memory Usage');
}

/**
 * @param completedDir {string}, absolute path to the directory where the file should be moved to
 * @param filePath {string}, absolute path to the file that was loaded
 * @param simulate {boolean}, if true, this method will just log what it would do
 * @returns {Promise<void>}
 */
async function moveFile(completedDir, filePath, simulate = false) {
  if (!fs.existsSync(completedDir)) {
    Logger.info(`Creating directory ${completedDir}`);
    if (!simulate) {
      await mkdir(completedDir);
    }
  }

  const fileName = path.basename(filePath);
  const tokens = fileName.split('.');
  const fileBaseName = tokens.shift();
  const fileExt = tokens.join('.');

  const newFile = path.join(completedDir, `${Date.now()}-${fileBaseName}.${fileExt}`);
  Logger.info('Moving file', { from: filePath, to: newFile });
  if (!simulate) {
    await rename(filePath, newFile);
  }
}

/**
 * Reads all files in a given directory looking for csv files where the name of the file
 * matches the name of an existing channel.  For each match, returns an array of file
 * load objects of the format:
 *
 * ```
 * {
 *   filePath: {string}, absolute path to the file to be loaded
 *   channelId: {string}, channel id to load the file results into'
 *   channelName: {string}, name of the channel
 * }
 * ```
 *
 * @param polarity {Object}, connected polarity-node-rest-api object
 * @param directory {string}, directory files shoudl be read from
 * @returns {Promise<[]>}
 */
async function getFilesToLoad(polarity, directory) {
  const allFiles = await readdir(directory);
  const csvFilesToLoad = [];

  for (const file of allFiles) {
    const channelName = file.split('.')[0];
    try {
      const channel = await polarity.getChannel(channelName);
      if (channel) {
        csvFilesToLoad.push({
          filePath: path.join(directory, file),
          channelId: channel.id,
          channelName: channelName
        });
      }
    } catch (channelErr) {
      Logger.error('getFilesToLoad Error', channelErr);
    }
  }

  return csvFilesToLoad;
}

module.exports = {
  getFilesToLoad,
  loadCsvIntoChannel,
  moveFile,
  cleanupOldFiles
};
