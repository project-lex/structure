# structure

## Get started

### Requirements

A running [docker](https://docker.com) engine and make has to be installed.

### Setup

1. Clone this Repository
2. copy `docker/.env.example`
3. rename it to `.env`
4. set your git credentials in `CM_GIT_TOKEN` and `CM_GIT_USERNAME`
5. check if `CM_VAULT_TOKEN` is set (can be root NOT recommended in production)
6. check other credentials, you may update or set other values too
7. run `make setup` (on windows as administrator, mac/linux a sudo prompt will appear)
8. check if services run

### UI

some goals are not working inside the UI (like dns). You need to run it in the terminal.
