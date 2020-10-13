# Polarity CSV Loader

![image](https://img.shields.io/badge/status-beta-green.svg)

This is a Node.js based helper library for uploading CSV files in an automated fashion.

This tool is currently in `beta`.  If you're interested in using this tool please contact us at support@polarity.io for assistance.

# Overview

The Polarity CSV Loader tool provides a CLI interface to read CSV files in from a given directory.  The data in the CSV will be loaded into a Polarity channel of the same name.  **Prior to uploading the CSV, the Channel will have its existing data cleared**. 

The CSV files should follow the same format that is used to upload data into a channel via the Polarity UI:

```
entity1, tag1, tag2
entity2, tag3, tag4
entity3, tag5, tag6, tag7
```

The name of the CSV file should match the channel you want to upload information into.  For example, if you want to upload data into a channel called `hostname-info` you would name your CSV file `hostname-info.csv`.

Prior to uploading information, this script will clear the channel and then load data into it.

After the script runs, any files that have been successfully loaded will be moved into a directory called `completed`.  The files will also be renamed so that their filename includes a timestamp of when the data was loaded.

If the file upload failed, the file will be moved into a directory called `failed`.

Finally, only the last 10 completed files will be kept in the `completed` directory.

```
Load any CSV files

Options:
  --help       Show help  [boolean]
  --version    Show version number  [boolean]
  --username   Username to login as  [string]
  --password   Password for the given Polarity username  [string] [required]
  --url        Polarity server url to include schema  [string] [required]
  --directory  Directory to read CSV files from  [string] [required]
  --simulate   If provided, the loader will log a preview of the actions it would take but no actions will be taken.  [boolean] [default: false]
  --headers    If provided, the loader will skip the first row in the CSV and treat it as a header  [boolean] [default: false]
```

### Directory Structure

When running the script you must pass a `--directory`.  This is the directory where `csv` files will be read from.  For a file to be loaded, a matching channel must be found in the configured Polarity instance.  Also ensure that the user you are connecting to Polarity as has `admin` permissions on the channel (this is required so the channel can be cleared).  

### Example Configurations

Basic configuration:

```
./polarity-csv-loader.sh -username csv_loader --password password123 --url https://polarity.dev --directory /home/centos/upload-data 
```

If your CSV files include headers then pass the `--header` argument:

```
./polarity-csv-loader.sh -username csv_loader --password password123 --url https://polarity.dev --directory /home/centos/upload-data --header
```

If you'd like to test the script without actually loading data use the `--simulate` command:

```
./polarity-csv-loader.sh -username csv_loader --password password123 --url https://polarity.dev --directory /home/centos/upload-data --simulate
```

You can also pass the Polarity username and password via an environment file.  To do this, copy the `.env.tmpl` file to a `.env` file which should be located at the top level of the `polarity-csv-loader` directory.  Edit the `.env` file so that it contains your `POLARITY_USERNAME` and `POLARITY_PASSWORD` environment variables.

The `.env` file should then have permissions changed on it so that it is only readable by `root` (or by the user that will be running the `polarity-csv-loader` script):

```
chown root.root .env
chmod 400 .env
```

If the `.env` file is present and contains the `POLARITY_PASSWORD` or `POLARITY_USERNAME` environment variables then you do not need to include the `--username` and `--password` parameters when running the script:

```
# With `.env` file set
./polarity-csv-loader.sh --url https://polarity.dev --directory /home/centos/upload-data 
```


