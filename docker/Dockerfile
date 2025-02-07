# syntax = docker/dockerfile:experimental
#DOCKER_BUILDKIT=1 docker build --progress=plain -t allbuild .

FROM ubuntu:22.04

RUN apt update
RUN apt-get update
RUN apt upgrade -y
RUN apt-get upgrade -y

# --- CURL
RUN apt-get install curl -y

# --- NANO
RUN apt-get install nano -y

# --- GIT
RUN apt-get install git -y

# --- GOSU
RUN apt-get install gosu -y

# --- lsof
RUN apt-get install lsof -y

# --- NGINX
RUN apt-get install nginx -y

# --- LIBRE OFFICE
RUN apt-get update
RUN apt install libreoffice -y

# --- NODE and NPX
ARG NODE_VERSION
# https://github.com/nodesource/distributions/blob/master/README.md -> Node.js LTS (v18.x): -> # Using Debian, as root
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash 
RUN apt-get install -y nodejs
RUN node -v
RUN npx -v

# --- POSTGRES 
# For missing 'lsb-release'
RUN apt-get update && apt-get install -y lsb-release && apt-get clean all
ARG POSTGRES_VERSION
# https://www.postgresql.org/download/linux/ubuntu/
RUN echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" >> /etc/apt/sources.list.d/pgdg.list
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add
RUN apt-get update
# make sure postgresql install is prompt free
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get install -y postgresql-${POSTGRES_VERSION}

# --- YARN
RUN curl -fsSL https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add 
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
RUN apt-get update
RUN apt-get install yarn -y

# Uncomment following line to force Docker to skip cache from here on:
# ADD "https://www.random.org/cgi-bin/randbyte?nbytes=10&format=h" skipcache

# --- ADD REPOS
ARG SERVER_BRANCH=main
ARG WEB_APP_BRANCH=main
WORKDIR /usr/src/
RUN git clone -b ${SERVER_BRANCH} https://github.com/openmsupply/conforma-server.git
RUN git clone -b ${WEB_APP_BRANCH} https://github.com/openmsupply/conforma-web-app.git

# --- BUILD SERVER
WORKDIR /usr/src/conforma-server
RUN yarn install
RUN yarn build

# --- BUILD WEB APP
WORKDIR /usr/src/conforma-web-app
RUN yarn install
RUN yarn build

# --- ADD NGINX CONFIG
COPY nginx_config/conforma.conf /etc/nginx/conf.d/

# --- ADD POSTGRES CONFIG
WORKDIR /etc/postgresql/${POSTGRES_VERSION}/main
COPY postgres_config/postgresql.conf .
# RUN echo "listen_addresses = '*'" >> postgresql.conf
COPY postgres_config/pg_hba.conf .

# --- INITIALISE DATABASE (default: core templates)
ARG INITIAL_SNAPSHOT=""
WORKDIR /usr/src/conforma-server/database/_snapshots
COPY snapshots/${INITIAL_SNAPSHOT}/ ./${INITIAL_SNAPSHOT}

WORKDIR /usr/src/initialise_database
COPY database.sh .
RUN ./database.sh ${INITIAL_SNAPSHOT}
RUN rm -rf /usr/src/conforma-server/database/_snapshots/${INITIAL_SNAPSHOT}

# --- CREATE LOG DIR
WORKDIR /var/log/conforma

# --- PREPARING ENTRY
WORKDIR /usr/src/entry
COPY entry.sh .
WORKDIR /usr/src/conforma-server
ENTRYPOINT /./usr/src/entry/entry.sh

EXPOSE 3000