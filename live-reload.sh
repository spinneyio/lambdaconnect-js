#!/usr/bin/env bash

function build {
  yarn prepare
}

function sync {
  rsync -av --delete --exclude 'node_modules/' --exclude 'src/' --exclude '.git/' ./ ../nourish-web/node_modules/lambdaconnect-js
}

build
sync

while inotifywait -q -r --exclude '(\.git/|\.idea/|\.build/|build/)' -e modify,create,delete,move,move_self .; do
  build
  sync
done
