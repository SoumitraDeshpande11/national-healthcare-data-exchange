import hudson.model.BooleanParameterDefinition
import hudson.model.ParametersDefinitionProperty
import hudson.security.FullControlOnceLoggedInAuthorizationStrategy
import hudson.security.HudsonPrivateSecurityRealm
import jenkins.model.Jenkins
import org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition
import org.jenkinsci.plugins.workflow.job.WorkflowJob

def jenkins = Jenkins.get()
def adminUser = System.getenv('JENKINS_ADMIN_ID') ?: 'soumitra'
def adminPassword = System.getenv('JENKINS_ADMIN_PASSWORD') ?: 'deshpande'
def jobName = System.getenv('PIPELINE_JOB_NAME') ?: 'national-healthcare-data-exchange'
def repositoryUrl = System.getenv('REPOSITORY_URL') ?: 'https://github.com/SoumitraDeshpande11/national-healthcare-data-exchange.git'
def escapedRepositoryUrl = repositoryUrl.replace("\\", "\\\\").replace("'", "\\'")

def realm = new HudsonPrivateSecurityRealm(false)
if (realm.getUser(adminUser) == null) {
  realm.createAccount(adminUser, adminPassword)
}
jenkins.setSecurityRealm(realm)

def auth = new FullControlOnceLoggedInAuthorizationStrategy()
auth.setAllowAnonymousRead(false)
jenkins.setAuthorizationStrategy(auth)

def script = """
pipeline {
  agent any

  parameters {
    booleanParam(name: 'BUILD_CONTAINER', defaultValue: true, description: 'Build API and portal Docker images.')
    booleanParam(name: 'VERIFY_RUNNING_PLATFORM', defaultValue: true, description: 'Verify the already-running Compose platform from inside Jenkins without stopping it.')
    booleanParam(name: 'RUN_LIVE_SMOKE', defaultValue: false, description: 'Start and stop a reduced Docker Compose smoke stack. Stop the regular local stack first if host ports are busy.')
    booleanParam(name: 'RUN_TRIVY', defaultValue: false, description: 'Run Trivy image scan.')
    booleanParam(name: 'DEPLOY_LOCAL_K8S', defaultValue: false, description: 'Apply manifests to the configured local Kubernetes cluster.')
    booleanParam(name: 'RUN_TERRAFORM', defaultValue: true, description: 'Run Terraform validation and plan for terraform/local.')
  }

  environment {
    REPOSITORY_URL = '${escapedRepositoryUrl}'
    IMAGE_NAME = 'healthcare/exchange-api'
    IMAGE_TAG = "jenkins-\${env.BUILD_NUMBER}"
    K8S_NAMESPACE = 'healthcare-exchange'
    K8S_RENDERED = 'build/kubernetes-rendered.yaml'
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('Checkout') {
      steps {
        deleteDir()
        checkout([
          \$class: 'GitSCM',
          branches: [[name: '*/main']],
          userRemoteConfigs: [[url: env.REPOSITORY_URL]]
        ])
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
      steps {
        sh '''
          set -eu
          mkdir -p build
          kubectl kustomize kubernetes/base > "\${K8S_RENDERED}"
        '''
      }
    }

    stage('Build Containers') {
      when {
        expression { return params.BUILD_CONTAINER }
      }
      steps {
        sh 'docker build -t "\${IMAGE_NAME}:\${IMAGE_TAG}" -t "\${IMAGE_NAME}:local" -f services/exchange-api/Dockerfile .'
        sh 'docker build -t "healthcare/portal:\${IMAGE_TAG}" -t "healthcare/portal:local" -f services/portal/Dockerfile .'
      }
    }

    stage('Terraform Validate') {
      when {
        expression { return params.RUN_TERRAFORM && fileExists("terraform/local/main.tf") }
      }
      steps {
        dir("terraform/local") {
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

    stage('Verify Running Platform') {
      when {
        expression { return params.VERIFY_RUNNING_PLATFORM }
      }
      steps {
        sh 'npm run validate:jenkins-platform'
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
        sh 'docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --severity HIGH,CRITICAL --exit-code 1 "\${IMAGE_NAME}:\${IMAGE_TAG}"'
      }
    }

    stage('Deploy Local Kubernetes') {
      when {
        expression { return params.DEPLOY_LOCAL_K8S }
      }
      steps {
        sh 'kubectl apply -k kubernetes/base'
        sh 'kubectl rollout status deployment/exchange-api -n "\${K8S_NAMESPACE}" --timeout=180s'
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'build/*.yaml,docs/**/*.md,kubernetes/**/*.yaml,terraform/**/*.tf,terraform/**/*.md', allowEmptyArchive: true
    }
  }
}
"""

def job = jenkins.getItem(jobName)
if (job == null) {
  job = jenkins.createProject(WorkflowJob, jobName)
}
job.setDefinition(new CpsFlowDefinition(script, true))
job.removeProperty(ParametersDefinitionProperty)
job.addProperty(new ParametersDefinitionProperty([
  new BooleanParameterDefinition('BUILD_CONTAINER', true, 'Build API and portal Docker images.'),
  new BooleanParameterDefinition('VERIFY_RUNNING_PLATFORM', true, 'Verify the already-running Compose platform from inside Jenkins without stopping it.'),
  new BooleanParameterDefinition('RUN_LIVE_SMOKE', false, 'Start and stop a reduced Docker Compose smoke stack. Stop the regular local stack first if host ports are busy.'),
  new BooleanParameterDefinition('RUN_TRIVY', false, 'Run Trivy image scan.'),
  new BooleanParameterDefinition('DEPLOY_LOCAL_K8S', false, 'Apply manifests to the configured local Kubernetes cluster.'),
  new BooleanParameterDefinition('RUN_TERRAFORM', true, 'Run Terraform validation and plan for terraform/local.')
]))
job.save()
jenkins.save()
