pipeline {
  agent any

  parameters {
    booleanParam(name: 'BUILD_CONTAINER', defaultValue: true, description: 'Build the local exchange-api and portal container images.')
    booleanParam(name: 'RUN_LIVE_SMOKE', defaultValue: false, description: 'Run Docker Compose smoke tests. Use only when host ports are free or the local stack may be restarted.')
    booleanParam(name: 'RUN_TRIVY', defaultValue: false, description: 'Run Trivy image scan when Docker is available.')
    booleanParam(name: 'DEPLOY_LOCAL_K8S', defaultValue: false, description: 'Apply manifests to the currently configured local Kubernetes cluster.')
    booleanParam(name: 'RUN_TERRAFORM', defaultValue: false, description: 'Run Terraform init/validate/plan for terraform/local.')
  }

  environment {
    IMAGE_NAME = 'healthcare/exchange-api'
    IMAGE_TAG = "ci-${env.BUILD_NUMBER}"
    K8S_NAMESPACE = 'healthcare-exchange'
    K8S_RENDERED = 'build/kubernetes-rendered.yaml'
    TERRAFORM_DIR = 'terraform/local'
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        sh '''
          set -eu
          if [ -f package-lock.json ]; then
            npm ci
          else
            npm install
          fi
        '''
      }
    }

    stage('Application Validation') {
      steps {
        sh 'npm run validate'
      }
    }

    stage('Build Applications') {
      steps {
        sh 'npm run build'
      }
    }

    stage('Kubernetes Validate') {
      when {
        expression { return fileExists('kubernetes/base/kustomization.yaml') }
      }
      steps {
        sh '''
          set -eu
          mkdir -p build
          kubectl kustomize kubernetes/base > "${K8S_RENDERED}"
        '''
      }
    }

    stage('Terraform Validate') {
      when {
        expression { return params.RUN_TERRAFORM && fileExists("${env.TERRAFORM_DIR}/main.tf") }
      }
      steps {
        dir("${TERRAFORM_DIR}") {
          sh '''
            set -eu
            terraform fmt -check
            terraform init -backend=false
            terraform validate
            terraform plan -input=false -out=tfplan
          '''
        }
      }
    }

    stage('Build Container') {
      when {
        expression { return params.BUILD_CONTAINER }
      }
      steps {
        sh 'docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" -t "${IMAGE_NAME}:local" -f services/exchange-api/Dockerfile .'
        sh 'docker build -t "healthcare/portal:${IMAGE_TAG}" -t "healthcare/portal:local" -f services/portal/Dockerfile .'
      }
    }

    stage('Live Integration Smoke') {
      when {
        expression { return params.RUN_LIVE_SMOKE }
      }
      steps {
        sh '''
          set -eu
          docker compose up -d --build postgres redis minio vault vault-bootstrap exchange-api portal
          npm run validate:smoke
        '''
      }
      post {
        always {
          sh 'docker compose down || true'
        }
      }
    }

    stage('Security Scan') {
      when {
        expression { return params.RUN_TRIVY && params.BUILD_CONTAINER }
      }
      steps {
        sh 'npm audit --audit-level=high'
        sh 'docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --severity HIGH,CRITICAL --exit-code 1 "${IMAGE_NAME}:${IMAGE_TAG}"'
      }
    }

    stage('Deploy Local Kubernetes') {
      when {
        expression { return params.DEPLOY_LOCAL_K8S && fileExists('kubernetes/base/kustomization.yaml') }
      }
      steps {
        sh 'kubectl apply -k kubernetes/base'
        sh 'kubectl rollout status deployment/exchange-api -n "${K8S_NAMESPACE}" --timeout=180s'
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'build/*.yaml,docs/**/*.md,kubernetes/**/*.yaml,terraform/**/*.tf,terraform/**/*.md,terraform/**/tfplan', allowEmptyArchive: true
    }
  }
}
