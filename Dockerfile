FROM mhart/alpine-node:8

WORKDIR /app
ADD package.json package.json
ADD yarn.lock yarn.lock
RUN yarn install
ADD . .
RUN yarn run build

EXPOSE 28777
EXPOSE 28778

CMD ["node", "bin/log.io-server", "conf/server.minimal.json"]