FROM jenkins/jenkins:lts-jdk17

USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    gnupg \
    jq \
    lsb-release \
    unzip \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && chmod a+r /etc/apt/keyrings/docker.asc \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    docker-ce-cli \
    docker-compose-plugin \
    nodejs \
  && case "$(dpkg --print-architecture)" in \
    amd64) KUBE_ARCH=amd64; TERRAFORM_ARCH=amd64 ;; \
    arm64) KUBE_ARCH=arm64; TERRAFORM_ARCH=arm64 ;; \
    *) echo "unsupported architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
  esac \
  && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/v1.32.0/bin/linux/${KUBE_ARCH}/kubectl" \
  && chmod +x /usr/local/bin/kubectl \
  && curl -fsSL -o /tmp/terraform.zip "https://releases.hashicorp.com/terraform/1.9.8/terraform_1.9.8_linux_${TERRAFORM_ARCH}.zip" \
  && unzip -q /tmp/terraform.zip -d /usr/local/bin \
  && rm -f /tmp/terraform.zip \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

RUN jenkins-plugin-cli --plugins \
  git \
  pipeline-stage-view \
  prometheus \
  timestamper \
  workflow-aggregator

ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false"

COPY docker/jenkins/init.groovy.d/ /usr/share/jenkins/ref/init.groovy.d/
