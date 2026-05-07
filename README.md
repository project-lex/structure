# structure

## Get started

### Requirements
A running [docker](https://docker.com) engine and make has to be installed.

### Setup

1. Clone this Repository
2. copy `docker/.env.example`
3. rename it to `.env`
3. set your git credentials in `CM_GIT_TOKEN` and `CM_GIT_USERNAME`
4. check if `CM_VAULT_TOKEN` is set (can be root NOT recommended in production)
5. check other credentials, you may update or set other values too
6. run `make setup` (on windows as administrator, mac/linux a sudo prompt will appear)
7. check if services run
