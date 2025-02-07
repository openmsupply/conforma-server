# Conforma Custom Demo

This is the configuration for launching a customized demo system -- docker instances are spun up in response to user requests.

## How it works

- Users request a custom demo from [https://demo.conforma.nz/](https://demo.conforma.nz/)
- On confirmation, that registration system emits a config file to a shared volume on the demo system
- The "watch" service [Watch and Run](https://github.com/msupply-foundation/watch-and-run) detects this file and launches a docker image (preloaded with a demo system) with user passwords set to that requested by the user.
- After 24 hours, the stand-alone system is shut down.