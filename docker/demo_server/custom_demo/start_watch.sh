#!/bin/bash

source demo.env && sudo SMTP_PASSWORD=$SMTP_PASSWORD TAG=$TAG pm2 start watch.js -- config.json --name DemoDockerWatcher
