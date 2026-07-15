FROM ubuntu:24.04

COPY build/dayz-server-manager /usr/local/bin/

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        lib32gcc-s1 \
        libcap-dev \
        libcurl4 \
        libcurl4-openssl-dev && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir /dayz && \
    groupadd --gid 1001 dayz && \
    useradd --uid 1001 --gid 1001 --system -m -d /dayz -s /bin/bash dayz && \
    chown dayz:dayz /dayz && \
    chmod +x /usr/local/bin/dayz-server-manager

WORKDIR /dayz
USER dayz

VOLUME /dayz/

CMD ["dayz-server-manager"]
