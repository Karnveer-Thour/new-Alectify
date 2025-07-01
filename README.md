<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```
## Docker steps 

### Developnment server for debugging
```bash
docker build --no-cache -t operations-nestjs-development -f Dockerfile.dev .
docker run -d -p 4001:4001 operations-nestjs-development
or (if .env is in .dockerignore)
docker run --env-file .env -p 4001:4001 operations-nestjs-development
``` 
### Production server
```bash
docker build --no-cache -t operations-nestjs-deploy -f Dockerfile.prod .
docker run -d -p 4001:4001 operations-nestjs-deploy
or 
docker run --env-file .env -p 4001:4001 operations-nestjs-development
```

### Stop a Container (by container ID or name):
```bash
docker stop <container_id_or_name>
```
### find the container ID or name using:
```bash
docker ps
```
### Stop All Running Containers:
```bash
docker stop $(docker ps -q)
```
### Start a Container (if it's stopped):
```bash
docker start <container_id_or_name>
```
### Restart a Container:
```bash
docker restart <container_id_or_name>
```
### View Logs of a Running Container:
```bash
docker logs <container_id_or_name>
```

### Follow Logs in Real-Time:
```bash
docker logs -f <container_id_or_name>
```
### Access a Running Container's Shell (for debugging)
```bash
docker exec -it <container_id_or_name> bash
```
### removing containers
```bash
docker rm $(docker ps -aq)
```
### To clean everything up (containers, images, volumes, etc.):
```bash
docker system prune -a --volumes
```
## License

Nest is [MIT licensed](LICENSE).
# new-Alectify
# new-Alectify
# new-Alectify
