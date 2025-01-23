#!/bin/bash
set -e
echo 'checking preferences exist'
ts-node ./src/loadPrefs.ts
echo 'removing build folder'
rm -rf ./build
echo 'building app with tsc'
tsc
echo 'copying images'
cp -R images ./build/
echo 'copying database related files'
cp -R database/buildSchema ./build/database/
cp -R database/insertData ./build/database/
cp -R database/core_templates ./build/database/
echo 'copying import/export scripts for snapshots'
cp -R database/*.sh build/database
cp -R database/*.sql build/database
echo 'building plugins'
node --unhandled-rejections=strict ./utils/pluginScripts/buildPlugins.js
