#!/bin/bash

BRANCH_NAME=${1:-develop} # Use develop if no branch/tag specified in args
IMAGE_NAME='conforma'
ACCOUNT='msupplyfoundation'
INITIAL_DATA_LOCALE=''
PUSH=${2:-nopush} # Default won't push to Docker hub

NODE_VERSION='18'
POSTGRES_VERSION='16'

# Generate a random ID so Images built on same day with same branch
# have a unique name
RANDOM_ID=$(openssl rand -hex 3)

IMAGE_TAG="build-${BRANCH_NAME}_$(date +"%Y-%m-%d")_${RANDOM_ID}"

echo -e "\nBuilding image: ${IMAGE_TAG}\n"

if [ $INITIAL_SNAPSHOT ]; then
   echo -e "\nUsing snapshot: "${INITIAL_SNAPSHOT}""
fi

docker build \
   --progress plain \
   -t "${ACCOUNT}/${IMAGE_NAME}:${IMAGE_TAG}" \
   --build-arg SERVER_BRANCH="$BRANCH_NAME" \
   --build-arg WEB_APP_BRANCH="$BRANCH_NAME" \
   --build-arg NODE_VERSION="$NODE_VERSION" \
   --build-arg POSTGRES_VERSION="$POSTGRES_VERSION" \
   --build-arg INITIAL_DATA_LOCALE="$INITIAL_DATA_LOCALE" \
   --build-arg INITIAL_SNAPSHOT="$INITIAL_SNAPSHOT" \
   --platform "linux/amd64" \
   .

echo -e "\nFinished building. To run locally, use command:\nyarn docker_run ${ACCOUNT}/${IMAGE_NAME}:${IMAGE_TAG}\n"

if [ $PUSH = 'push' ]; then
   # We don't need to Tag if the full local name is exactly the same as the  full remote name
   echo -e "\nPushing to Docker hub:\ndocker push "${ACCOUNT}/${IMAGE_NAME}:${IMAGE_TAG}"\n"
   docker push "${ACCOUNT}/${IMAGE_NAME}:${IMAGE_TAG}"
fi

# -t testbuild -> tag for the image, would be something like 'TMF-conforma:B-{back end tag}-F-{front end tag}'
# --build-arg SERVER_BRANCH and WEB_APP_BRANCH -> branch of front and back end to pull and build (should be able to use just the tag name), can escape # with \#
# --secret id=githubtoken,src=../githubtoken.txt -> can 'secretly' and temporarily mount file (see top comment about this particular file)
# --no-cache -> can be used to re-build (if for example branch content you are building has changed)
# --progress plain -> show full progress
