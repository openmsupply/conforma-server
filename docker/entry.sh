#!/bin/bash

echo '---'
echo '---'
echo '--- STARTING POSTGRES'
echo '---'
echo '---'
service postgresql start
service postgresql status

echo '---'
echo '---'
echo '--- STARTING NGINX'
echo '---'
echo '---'
service nginx start
service nginx status

echo '---'
echo '---'
echo '--- STARTING SERVER'
echo '---'
echo '---'
NODE_ENV=production node ./build/src/server.js | tee -a /var/log/conforma/server.log &

echo '---'
echo '---'
echo '--- Ready to go -> http://localhost:3000'
echo '---'
echo '---'
/bin/bash
