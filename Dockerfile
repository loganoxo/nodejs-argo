FROM node:alpine3.20

WORKDIR /tmp

# 经测试 使用 COPY . . 时, 需要把secret.js放在.dockerignore中, 或者直接复制单独的文件
# COPY . .
COPY Dockerfile index.min.js package.json ./

EXPOSE 3000/tcp

RUN apk update && apk upgrade &&\
    apk add --no-cache openssl curl gcompat iproute2 coreutils &&\
    apk add --no-cache bash &&\
    chmod +x index.min.js &&\
    npm install

CMD ["node", "index.min.js"]
