import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  FilePlus2,
  FileText,
  Gauge,
  HardDriveUpload,
  History,
  Hospital,
  KeyRound,
  Layers3,
  LockKeyhole,
  LogIn,
  LogOut,
  Network,
  Pill,
  RefreshCcw,
  Search,
  ShieldCheck,
  Stethoscope,
  TestTube2,
  UploadCloud,
  UserRoundPlus,
  Workflow
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

type Organization = {
  label: string;
  shortName: string;
  type: "agency" | "hospital" | "laboratory" | "pharmacy" | "insurer";
  icon: React.ReactNode;
  purpose: string;
  capabilities: string[];
};

const organizations: Organization[] = [
  {
    label: "National Health Agency",
    shortName: "Agency",
    type: "agency",
    icon: <Building2 />,
    purpose: "Operate compliance, audit, registry, and nationwide platform oversight.",
    capabilities: ["Compliance oversight", "Audit review", "Patient registry"]
  },
  {
    label: "Metro General Hospital",
    shortName: "Hospital",
    type: "hospital",
    icon: <Hospital />,
    purpose: "Register patients and publish clinical encounters into the exchange.",
    capabilities: ["Patient registration", "Encounter publishing", "Record lookup"]
  },
  {
    label: "Apex Diagnostic Lab",
    shortName: "Laboratory",
    type: "laboratory",
    icon: <TestTube2 />,
    purpose: "Publish validated diagnostic results and make them available to care teams.",
    capabilities: ["Lab result publishing", "Record lookup"]
  },
  {
    label: "CarePlus Pharmacy",
    shortName: "Pharmacy",
    type: "pharmacy",
    icon: <Pill />,
    purpose: "Publish prescriptions and medication fulfillment records.",
    capabilities: ["Prescription publishing", "Record lookup"]
  },
  {
    label: "SecureLife Insurance",
    shortName: "Insurer",
    type: "insurer",
    icon: <ShieldCheck />,
    purpose: "Publish claim records and validate authorized patient data access.",
    capabilities: ["Claim publishing", "Record lookup"]
  }
];

const platformStats = [
  { label: "Target volume", value: "100M+", detail: "records" },
  { label: "Exchange modes", value: "5", detail: "org roles" },
  { label: "Runtime", value: "Local", detail: "Docker stack" },
  { label: "Controls", value: "RBAC", detail: "audit + secrets" }
];

const architectureCards = [
  {
    icon: <Workflow />,
    title: "Interoperability APIs",
    text: "Containerized services expose patient, record, auth, compliance, and health endpoints."
  },
  {
    icon: <Network />,
    title: "Realtime Sync",
    text: "Record writes publish sync events so downstream participants can converge quickly."
  },
  {
    icon: <LockKeyhole />,
    title: "Security Controls",
    text: "Scoped JWTs, RBAC routes, audit logging, Vault-backed configuration, and encrypted stores."
  },
  {
    icon: <HardDriveUpload />,
    title: "Disaster Recovery",
    text: "Local backup and failover scripts demonstrate recovery procedures for the platform."
  }
];

const pipelineSteps = ["Commit", "Lint", "Compliance", "Tests", "Build", "Container", "Scan", "Deploy"];

const complianceControls = [
  { id: "AUTH", label: "Authentication", evidence: "Scoped JWT issued" },
  { id: "RBAC", label: "Role-Based Access", evidence: "Agency routes gated" },
  { id: "AUD", label: "Audit Logging", evidence: "Events queryable" },
  { id: "DOC", label: "Document Exchange", evidence: "/documents active" },
  { id: "NET", label: "Network Policy", evidence: "Local stack isolated" },
  { id: "DR", label: "Disaster Recovery", evidence: "Recovery workflow available" }
];

const exchangeNodes = ["Hospital", "Lab", "Pharmacy", "Insurer"];
const DOCUMENTS_API = {
  collection: "/documents",
  patient: (nationalHealthId: string) => `/documents/patient/${encodeURIComponent(nationalHealthId)}`,
  download: (documentId: string) => `/documents/${encodeURIComponent(documentId)}/download`
};

type TokenResponse = {
  accessToken: string;
};

type OrganizationDirectoryEntry = {
  id: string;
  name: string;
  type: Organization["type"];
};

type Summary = {
  patients: number;
  records: number;
  auditEvents: number;
  syncEvents: Array<{ status: string; count: number }>;
};

type ClinicalRecord = {
  id: string;
  recordType: string;
  payload: Record<string, unknown>;
  version: number;
  sourceOrganization: string;
  createdAt: string;
};

type PatientDocument = {
  id: string;
  nationalHealthId: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceOrganization?: string;
  createdAt: string;
};

type AuditEvent = {
  id: string;
  actorOrgId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type Notice = {
  tone: "idle" | "success" | "warning" | "error";
  text: string;
};

type Screen = "landing" | "login" | "console";

function demoApiKeyFor(org: Organization) {
  const keyPrefix = org.type === "laboratory" ? "lab" : org.type;
  return [keyPrefix, "local", "api", "key"].join("-");
}

async function request<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(body.error ?? "request failed");
  }

  return body as T;
}

function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [selectedOrg, setSelectedOrg] = useState(organizations[0]);
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState<Notice>({ tone: "idle", text: "Choose an organization to access the exchange." });
  const [apiReady, setApiReady] = useState(false);
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [orgDirectory, setOrgDirectory] = useState<OrganizationDirectoryEntry[]>([]);
  const [records, setRecords] = useState<ClinicalRecord[]>([]);
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [searchId, setSearchId] = useState("NHID-1000001");
  const [documentSearchId, setDocumentSearchId] = useState("NHID-1000001");
  const [patientForm, setPatientForm] = useState({
    nationalHealthId: "NHID-1000002",
    fullName: "Neha Rao",
    dateOfBirth: "1999-08-21",
    consentStatus: "active"
  });
  const [recordForm, setRecordForm] = useState({
    nationalHealthId: "NHID-1000001",
    recordType: "lab_result",
    payload: "{\n  \"test\": \"CBC\",\n  \"result\": \"normal\",\n  \"lab\": \"Apex Diagnostic Lab\"\n}"
  });
  const [accessGrantForm, setAccessGrantForm] = useState({
    nationalHealthId: "NHID-1000001",
    organizationId: ""
  });
  const [documentForm, setDocumentForm] = useState<{
    nationalHealthId: string;
    documentType: string;
    description: string;
    file: File | null;
  }>({
    nationalHealthId: "NHID-1000001",
    documentType: "discharge_summary",
    description: "Signed discharge summary from Metro General Hospital",
    file: null
  });

  const isAgency = selectedOrg.type === "agency";
  const isSignedIn = Boolean(token);
  const syncStatus = useMemo(() => {
    return summary?.syncEvents.map((event) => `${event.status}: ${event.count}`).join(", ") ?? "No events loaded";
  }, [summary]);

  async function checkApi() {
    try {
      await request("/health/ready");
      setApiReady(true);
    } catch {
      setApiReady(false);
    } finally {
      setLastHealthCheck(new Date());
    }
  }

  async function login(org = selectedOrg) {
    try {
      setSelectedOrg(org);
      setNotice({ tone: "idle", text: `Signing in as ${org.shortName}...` });
      const result = await request<TokenResponse>("/auth/token", undefined, {
        method: "POST",
        body: JSON.stringify({ apiKey: demoApiKeyFor(org) })
      });
      setToken(result.accessToken);
      setScreen("console");
      setNotice({ tone: "success", text: `Signed in as ${org.label}` });
      setRecords([]);
      setDocuments([]);
      await loadOrganizations(result.accessToken, org.type);
      if (org.type === "agency") {
        await Promise.all([loadSummary(result.accessToken), loadAudits(result.accessToken)]);
      } else {
        setSummary(null);
        setAuditEvents([]);
      }
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Sign in failed" });
      setScreen("login");
    }
  }

  function signOut() {
    setToken("");
    setSummary(null);
    setAuditEvents([]);
    setOrgDirectory([]);
    setRecords([]);
    setDocuments([]);
    setNotice({ tone: "idle", text: "Signed out. Choose an organization to continue." });
    setScreen("landing");
  }

  async function loadOrganizations(activeToken = token, activeOrgType = selectedOrg.type) {
    if (!activeToken) return;
    try {
      const result = await request<{ organizations: OrganizationDirectoryEntry[] }>("/auth/organizations", activeToken);
      const participants = result.organizations.filter((org) => org.type !== "agency");
      setOrgDirectory(participants);
      setAccessGrantForm((current) => ({
        ...current,
        organizationId: current.organizationId || participants.find((org) => org.type !== activeOrgType)?.id || participants[0]?.id || ""
      }));
    } catch (error) {
      setNotice({ tone: "warning", text: error instanceof Error ? error.message : "Organization directory unavailable" });
    }
  }

  async function loadSummary(activeToken = token) {
    if (!activeToken) return;
    try {
      const result = await request<Summary>("/compliance/summary", activeToken);
      setSummary(result);
    } catch (error) {
      setNotice({ tone: "warning", text: error instanceof Error ? error.message : "Summary unavailable" });
    }
  }

  async function loadAudits(activeToken = token) {
    if (!activeToken) return;
    try {
      const result = await request<{ auditEvents: AuditEvent[] }>("/compliance/audit-events", activeToken);
      setAuditEvents(result.auditEvents);
    } catch (error) {
      setNotice({ tone: "warning", text: error instanceof Error ? error.message : "Audit events unavailable" });
    }
  }

  async function refreshAll() {
    await checkApi();
    if (isAgency) {
      await Promise.all([loadSummary(), loadAudits()]);
    }
    if (searchId) {
      await searchRecords(searchId);
    }
    if (documentSearchId) {
      await loadDocuments(documentSearchId);
    }
  }

  async function createPatient(event: React.FormEvent) {
    event.preventDefault();
    try {
      await request("/patients", token, {
        method: "POST",
        body: JSON.stringify(patientForm)
      });
      setAccessGrantForm((current) => ({ ...current, nationalHealthId: patientForm.nationalHealthId }));
      setNotice({ tone: "success", text: "Patient saved and audited." });
      if (isAgency) {
        await loadSummary();
      }
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Patient save failed" });
    }
  }

  async function createRecord(event: React.FormEvent) {
    event.preventDefault();
    try {
      await request("/records", token, {
        method: "POST",
        body: JSON.stringify({
          nationalHealthId: recordForm.nationalHealthId,
          recordType: recordForm.recordType,
          payload: JSON.parse(recordForm.payload)
        })
      });
      setNotice({ tone: "success", text: "Clinical record published and synced." });
      await searchRecords(recordForm.nationalHealthId);
      if (isAgency) {
        await loadSummary();
      }
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof SyntaxError ? "Record payload must be valid JSON" : error instanceof Error ? error.message : "Record publish failed"
      });
    }
  }

  async function searchRecords(id = searchId) {
    if (!token || !id) return;
    try {
      const result = await request<{ records: ClinicalRecord[] }>(`/records/patient/${encodeURIComponent(id)}`, token);
      setRecords(result.records);
      setSearchId(id);
      setNotice({ tone: "success", text: `Loaded ${result.records.length} record(s).` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Record lookup failed" });
    }
  }

  async function grantPatientAccess(event: React.FormEvent) {
    event.preventDefault();
    if (!accessGrantForm.organizationId) {
      setNotice({ tone: "warning", text: "Choose a participant organization to grant access." });
      return;
    }

    try {
      await request(`/patients/${encodeURIComponent(accessGrantForm.nationalHealthId)}/access-grants`, token, {
        method: "POST",
        body: JSON.stringify({ organizationId: accessGrantForm.organizationId })
      });
      const grantedOrg = orgDirectory.find((org) => org.id === accessGrantForm.organizationId);
      setNotice({ tone: "success", text: `Access granted to ${grantedOrg?.name ?? "selected organization"}.` });
      if (isAgency) {
        await loadAudits();
      }
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Access grant failed" });
    }
  }

  async function uploadDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (!documentForm.file) {
      setNotice({ tone: "warning", text: "Choose a document file before uploading." });
      return;
    }

    const formData = new FormData();
    formData.append("nationalHealthId", documentForm.nationalHealthId);
    formData.append("documentType", documentForm.documentType);
    formData.append("description", documentForm.description);
    formData.append("file", documentForm.file);

    try {
      const response = await fetch(`${API_BASE}${DOCUMENTS_API.collection}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: formData
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(body.error ?? "Document upload failed");
      }

      setNotice({ tone: "success", text: "Patient document uploaded." });
      await loadDocuments(documentForm.nationalHealthId);
      if (isAgency) {
        await loadSummary();
      }
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Document upload failed" });
    }
  }

  async function loadDocuments(id = documentSearchId) {
    if (!token || !id) return;
    try {
      const result = await request<{ documents?: PatientDocument[] } | PatientDocument[]>(DOCUMENTS_API.patient(id), token);
      const loadedDocuments = Array.isArray(result) ? result : result.documents ?? [];
      setDocuments(loadedDocuments);
      setDocumentSearchId(id);
      setNotice({ tone: "success", text: `Loaded ${loadedDocuments.length} document(s).` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Document lookup failed" });
    }
  }

  async function downloadDocument(document: PatientDocument) {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}${DOCUMENTS_API.download(document.id)}`, {
        headers: { authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const text = await response.text();
        const body = text ? JSON.parse(text) : {};
        throw new Error(body.error ?? "Document download failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.fileName || `${document.id}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice({ tone: "success", text: `Downloaded ${document.fileName}.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Document download failed" });
    }
  }

  useEffect(() => {
    checkApi();
  }, []);

  if (screen === "login") {
    return (
      <LoginScreen
        apiReady={apiReady}
        notice={notice}
        selectedOrg={selectedOrg}
        onBack={() => setScreen("landing")}
        onCheckApi={checkApi}
        onLogin={login}
        onSelectOrg={(org) => {
          setSelectedOrg(org);
          setNotice({ tone: "idle", text: `${org.label} selected.` });
        }}
      />
    );
  }

  if (screen === "console" && isSignedIn) {
    return (
      <ConsoleScreen
        apiReady={apiReady}
        accessGrantForm={accessGrantForm}
        auditEvents={auditEvents}
        documentForm={documentForm}
        documentSearchId={documentSearchId}
        documents={documents}
        isAgency={isAgency}
        lastHealthCheck={lastHealthCheck}
        notice={notice}
        onCreatePatient={createPatient}
        onCreateRecord={createRecord}
        onDownloadDocument={downloadDocument}
        onGrantPatientAccess={grantPatientAccess}
        onLoadDocuments={() => loadDocuments()}
        onLoadAudits={() => loadAudits()}
        onRefresh={refreshAll}
        onSearch={() => searchRecords()}
        onSignOut={signOut}
        onUploadDocument={uploadDocument}
        orgDirectory={orgDirectory}
        patientForm={patientForm}
        recordForm={recordForm}
        records={records}
        searchId={searchId}
        selectedOrg={selectedOrg}
        setAccessGrantForm={setAccessGrantForm}
        setDocumentForm={setDocumentForm}
        setDocumentSearchId={setDocumentSearchId}
        setPatientForm={setPatientForm}
        setRecordForm={setRecordForm}
        setSearchId={setSearchId}
        summary={summary}
        syncStatus={syncStatus}
      />
    );
  }

  return <LandingScreen apiReady={apiReady} onCheckApi={checkApi} onOpenLogin={() => setScreen("login")} />;
}

function LandingScreen({
  apiReady,
  onCheckApi,
  onOpenLogin
}: {
  apiReady: boolean;
  onCheckApi: () => void;
  onOpenLogin: () => void;
}) {
  return (
    <main className="public-shell">
      <header className="public-nav">
        <a href="#top" className="brand-mark" aria-label="National Healthcare Data Exchange home">
          <span className="brand-icon">
            <ShieldCheck size={24} />
          </span>
          <span>
            <strong>NHDE</strong>
            <small>National Healthcare Data Exchange</small>
          </span>
        </a>
        <nav aria-label="Landing sections">
          <a href="#platform">Platform</a>
          <a href="#architecture">Architecture</a>
          <a href="#operations">Operations</a>
        </nav>
        <button className="primary" onClick={onOpenLogin}>
          <LogIn size={18} />
          Login
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="eyebrow">Government Healthcare Interoperability</span>
          <h1>Secure nationwide patient record exchange, built as a local DevOps platform.</h1>
          <p>
            A production-style project for hospitals, labs, pharmacies, insurers, and a national agency to exchange records with RBAC,
            audit logs, sync events, monitoring, compliance checks, and recovery workflows.
          </p>
          <div className="hero-actions">
            <button className="primary large" onClick={onOpenLogin}>
              Enter Portal
              <ArrowRight size={19} />
            </button>
            <button className="secondary large" onClick={onCheckApi}>
              <Gauge size={19} />
              Check API
            </button>
          </div>
          <div className={`hero-status ${apiReady ? "ok" : "down"}`} role="status" aria-live="polite">
            {apiReady ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            Local API is {apiReady ? "ready" : "not reachable"}
          </div>
        </div>

        <div className="exchange-visual" aria-label="Healthcare exchange network visualization">
          <div className="visual-header">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="visual-grid">
            <div className="agency-node">
              <ShieldCheck size={32} />
              <strong>Agency Exchange Core</strong>
              <small>RBAC, audit, sync, DR</small>
            </div>
            {exchangeNodes.map((node, index) => (
              <div className={`participant-node node-${index + 1}`} key={node}>
                <span></span>
                <strong>{node}</strong>
              </div>
            ))}
            <div className="flow-line line-1"></div>
            <div className="flow-line line-2"></div>
            <div className="flow-line line-3"></div>
            <div className="flow-line line-4"></div>
          </div>
          <div className="visual-footer">
            <div>
              <span>FHIR-like records</span>
              <strong>Streaming</strong>
            </div>
            <div>
              <span>Compliance</span>
              <strong>Verified</strong>
            </div>
            <div>
              <span>Failover</span>
              <strong>Ready</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="stat-band" aria-label="Platform highlights">
        {platformStats.map((stat) => (
          <article key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.detail}</small>
          </article>
        ))}
      </section>

      <section className="landing-section" id="platform">
        <div className="section-kicker">
          <span className="eyebrow">Project Scope</span>
          <h2>Everything expected in a full DevOps healthcare exchange demo.</h2>
        </div>
        <div className="feature-grid">
          {architectureCards.map((card) => (
            <article className="feature-card" key={card.title}>
              <span className="feature-icon">{card.icon}</span>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section split-section" id="architecture">
        <div>
          <span className="eyebrow">Architecture</span>
          <h2>Local cloud-native stack running as containers on your laptop.</h2>
          <p>
            Docker Compose runs the exchange API, portal, PostgreSQL, Redis, MinIO, Vault, Prometheus, Grafana, Elasticsearch, and
            Kibana locally. The project also includes DevOps artifacts for Jenkins, Kubernetes, Terraform-style infrastructure, backup,
            failover, and compliance validation.
          </p>
        </div>
        <div className="stack-list">
          {["React Portal", "TypeScript API", "PostgreSQL", "Redis Sync", "Vault Secrets", "Prometheus", "Grafana", "ELK Logs"].map(
            (item) => (
              <span key={item}>{item}</span>
            )
          )}
        </div>
      </section>

      <section className="landing-section" id="operations">
        <div className="section-kicker">
          <span className="eyebrow">Operational Evidence</span>
          <h2>Login to run the exchange workflows.</h2>
        </div>
        <div className="role-preview">
          {organizations.map((org) => (
            <article key={org.type}>
              <span>{org.icon}</span>
              <strong>{org.shortName}</strong>
              <p>{org.capabilities.join(" / ")}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function LoginScreen({
  apiReady,
  notice,
  selectedOrg,
  onBack,
  onCheckApi,
  onLogin,
  onSelectOrg
}: {
  apiReady: boolean;
  notice: Notice;
  selectedOrg: Organization;
  onBack: () => void;
  onCheckApi: () => void;
  onLogin: (org?: Organization) => void;
  onSelectOrg: (org: Organization) => void;
}) {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <button className="ghost back-link" onClick={onBack}>
          <ArrowLeft size={18} />
          Back
        </button>
        <div className="login-heading">
          <span className="brand-icon">
            <ShieldCheck size={26} />
          </span>
          <div>
            <span className="eyebrow">Secure Access</span>
            <h1>Choose your organization role.</h1>
            <p>Each demo role signs in with a local API key and receives a scoped JWT from the exchange API.</p>
          </div>
        </div>

        <div className={`status ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"} aria-live="polite">
          {notice.tone === "error" ? <AlertCircle size={18} /> : <Activity size={18} />}
          <span>{notice.text}</span>
        </div>

        <div className="role-grid">
          {organizations.map((org) => (
            <button
              className={`role-card ${selectedOrg.type === org.type ? "selected" : ""}`}
              key={org.type}
              onClick={() => onSelectOrg(org)}
              type="button"
            >
              <span className="role-icon">{org.icon}</span>
              <strong>{org.label}</strong>
              <small>{org.purpose}</small>
            </button>
          ))}
        </div>

        <div className="login-actions">
          <button className="primary large" onClick={() => onLogin(selectedOrg)}>
            <KeyRound size={19} />
            Sign in as {selectedOrg.shortName}
          </button>
          <button className="secondary large" onClick={onCheckApi}>
            <Gauge size={19} />
            API {apiReady ? "Ready" : "Check"}
          </button>
        </div>
      </section>

      <aside className="login-aside">
        <span className="eyebrow">Access Model</span>
        <h2>Role-based workflows are separated before the console loads.</h2>
        <div className="capability-list">
          {selectedOrg.capabilities.map((capability) => (
            <span key={capability}>
              <CheckCircle2 size={16} />
              {capability}
            </span>
          ))}
        </div>
        <div className="auth-box">
          <small>Demo credential handling</small>
          <strong>Masked in portal UI</strong>
          <p>The portal submits the selected role to the local auth endpoint and only displays session status.</p>
        </div>
      </aside>
    </main>
  );
}

function ConsoleScreen({
  apiReady,
  accessGrantForm,
  auditEvents,
  documentForm,
  documentSearchId,
  documents,
  isAgency,
  lastHealthCheck,
  notice,
  onCreatePatient,
  onCreateRecord,
  onDownloadDocument,
  onGrantPatientAccess,
  onLoadDocuments,
  onLoadAudits,
  onRefresh,
  onSearch,
  onSignOut,
  onUploadDocument,
  orgDirectory,
  patientForm,
  recordForm,
  records,
  searchId,
  selectedOrg,
  setAccessGrantForm,
  setDocumentForm,
  setDocumentSearchId,
  setPatientForm,
  setRecordForm,
  setSearchId,
  summary,
  syncStatus
}: {
  apiReady: boolean;
  accessGrantForm: { nationalHealthId: string; organizationId: string };
  auditEvents: AuditEvent[];
  documentForm: { nationalHealthId: string; documentType: string; description: string; file: File | null };
  documentSearchId: string;
  documents: PatientDocument[];
  isAgency: boolean;
  lastHealthCheck: Date | null;
  notice: Notice;
  onCreatePatient: (event: React.FormEvent) => void;
  onCreateRecord: (event: React.FormEvent) => void;
  onDownloadDocument: (document: PatientDocument) => void;
  onGrantPatientAccess: (event: React.FormEvent) => void;
  onLoadDocuments: () => void;
  onLoadAudits: () => void;
  onRefresh: () => void;
  onSearch: () => void;
  onSignOut: () => void;
  onUploadDocument: (event: React.FormEvent) => void;
  orgDirectory: OrganizationDirectoryEntry[];
  patientForm: { nationalHealthId: string; fullName: string; dateOfBirth: string; consentStatus: string };
  recordForm: { nationalHealthId: string; recordType: string; payload: string };
  records: ClinicalRecord[];
  searchId: string;
  selectedOrg: Organization;
  setAccessGrantForm: React.Dispatch<React.SetStateAction<{ nationalHealthId: string; organizationId: string }>>;
  setDocumentForm: React.Dispatch<
    React.SetStateAction<{ nationalHealthId: string; documentType: string; description: string; file: File | null }>
  >;
  setDocumentSearchId: React.Dispatch<React.SetStateAction<string>>;
  setPatientForm: React.Dispatch<React.SetStateAction<{ nationalHealthId: string; fullName: string; dateOfBirth: string; consentStatus: string }>>;
  setRecordForm: React.Dispatch<React.SetStateAction<{ nationalHealthId: string; recordType: string; payload: string }>>;
  setSearchId: React.Dispatch<React.SetStateAction<string>>;
  summary: Summary | null;
  syncStatus: string;
}) {
  const demoSteps = [
    {
      title: "Verify API readiness",
      detail: apiReady ? "Local exchange API accepted the latest readiness probe." : "Run Refresh or Check API before starting writes.",
      status: apiReady ? "complete" : "attention"
    },
    {
      title: `Work as ${selectedOrg.shortName}`,
      detail: "A scoped session is active for the selected organization role.",
      status: "complete"
    },
    {
      title: "Publish exchange data",
      detail: records.length > 0 ? `${records.length} record(s) loaded in the current lookup.` : "Register a patient or publish a clinical record, then search the patient ID.",
      status: records.length > 0 ? "complete" : "pending"
    },
    {
      title: "Exercise document exchange",
      detail: documents.length > 0 ? `${documents.length} document(s) returned by ${DOCUMENTS_API.patient(documentSearchId)}.` : "Upload or search patient documents through the canonical /documents API.",
      status: documents.length > 0 ? "complete" : "pending"
    },
    {
      title: "Review audit trail",
      detail: isAgency
        ? auditEvents.length > 0
          ? `${auditEvents.length} audit event(s) loaded for agency review.`
          : "Load agency audit events after running a workflow."
        : "Switch to the agency role to view audit events.",
      status: auditEvents.length > 0 ? "complete" : isAgency ? "pending" : "locked"
    }
  ];

  const operationsSnapshot = [
    {
      label: "API readiness",
      value: apiReady ? "Ready" : "Unavailable",
      detail: lastHealthCheck ? `Checked ${lastHealthCheck.toLocaleTimeString()}` : "No health check yet",
      tone: apiReady ? "ok" : "down"
    },
    {
      label: "Document API",
      value: DOCUMENTS_API.collection,
      detail: "Upload, list, and download flow",
      tone: "ok"
    },
    {
      label: "Current lookup",
      value: records.length ? `${records.length} record(s)` : "No records loaded",
      detail: searchId,
      tone: records.length ? "ok" : "idle"
    },
    {
      label: "Audit access",
      value: isAgency ? `${auditEvents.length} event(s)` : "Role gated",
      detail: isAgency ? "Agency session can load events" : "Agency role required",
      tone: auditEvents.length ? "ok" : "idle"
    }
  ];
  const canGrantAccess = selectedOrg.type === "agency" || selectedOrg.type === "hospital";

  return (
    <main className="console-shell">
      <aside className="console-sidebar">
        <div className="brand-mark">
          <span className="brand-icon">
            <ShieldCheck size={24} />
          </span>
          <span>
            <strong>NHDE</strong>
            <small>Exchange Console</small>
          </span>
        </div>

        <div className="active-org">
          <span className="role-icon">{selectedOrg.icon}</span>
          <strong>{selectedOrg.label}</strong>
          <small>{selectedOrg.purpose}</small>
        </div>

        <div className={`status ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"} aria-live="polite">
          {notice.tone === "error" ? <AlertCircle size={18} /> : <Activity size={18} />}
          <span>{notice.text}</span>
        </div>

        <nav aria-label="Console sections">
          <a href="#overview">
            <Gauge size={18} />
            Overview
          </a>
          <a href="#demo">
            <Workflow size={18} />
            Demo Flow
          </a>
          <a href="#patients">
            <UserRoundPlus size={18} />
            Patients
          </a>
          <a href="#records">
            <FilePlus2 size={18} />
            Records
          </a>
          <a href="#documents">
            <FileText size={18} />
            Documents
          </a>
          <a href="#audit">
            <History size={18} />
            Audit
          </a>
        </nav>

        <button className="ghost signout" onClick={onSignOut}>
          <LogOut size={18} />
          Sign out
        </button>
      </aside>

      <section className="workspace">
        <header className="workspace-header" id="overview">
          <div>
            <span className="eyebrow">Operating Console</span>
            <h1>Healthcare Data Exchange</h1>
            <p>Run patient, record, audit, monitoring, and compliance workflows from one local interface.</p>
          </div>
          <div className="topbar-actions">
            <span className={`health-pill ${apiReady ? "ok" : "down"}`}>
              {apiReady ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              API {apiReady ? "Ready" : "Down"}
            </span>
            <button onClick={onRefresh}>
              <RefreshCcw size={18} />
              Refresh
            </button>
          </div>
        </header>

        <section className="metrics" aria-label="Exchange metrics">
          <Metric icon={<Database />} label="Patients" value={summary?.patients ?? "-"} tone="blue" />
          <Metric icon={<ClipboardList />} label="Records" value={summary?.records ?? "-"} tone="green" />
          <Metric icon={<History />} label="Audit Events" value={summary?.auditEvents ?? "-"} tone="amber" />
          <Metric icon={<Activity />} label="Sync Events" value={syncStatus} tone="red" />
        </section>

        <section className="guided-demo panel full" id="demo">
          <div className="section-title">
            <div>
              <h2>Guided Demo Flow</h2>
              <p>Follow the live workflow from API readiness through document exchange and audit review.</p>
            </div>
            <span className={`health-pill ${apiReady ? "ok" : "down"}`}>
              {apiReady ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {apiReady ? "Ready to demo" : "API check needed"}
            </span>
          </div>
          <div className="demo-steps">
            {demoSteps.map((step, index) => (
              <article className={`demo-step ${step.status}`} key={step.title}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="evidence-grid">
          <article className="panel">
            <div className="panel-heading">
              <Activity size={20} />
              <h2>Operations Snapshot</h2>
            </div>
            <div className="snapshot-grid">
              {operationsSnapshot.map((item) => (
                <article className={item.tone} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.detail}</small>
                </article>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <Layers3 size={20} />
              <h2>CI/CD Pipeline</h2>
            </div>
            <div className="pipeline">
              {pipelineSteps.map((step) => (
                <span key={step}>{step}</span>
              ))}
            </div>
          </article>
        </section>

        <section className="panel full">
          <div className="section-title">
            <div>
              <h2>Compliance Control Matrix</h2>
              <p>Implemented controls with demo evidence from the local DevOps stack.</p>
            </div>
          </div>
          <div className="control-matrix">
            {complianceControls.map((control) => (
              <article key={control.id}>
                <strong>{control.id}</strong>
                <span>{control.label}</span>
                <code>{control.evidence}</code>
              </article>
            ))}
          </div>
        </section>

        <section className="grid">
          <form className="panel" id="patients" onSubmit={onCreatePatient}>
            <div className="panel-heading">
              <UserRoundPlus size={20} />
              <h2>Register Patient</h2>
            </div>
            <label>
              <span>National Health ID</span>
              <input
                value={patientForm.nationalHealthId}
                onChange={(event) => setPatientForm({ ...patientForm, nationalHealthId: event.target.value })}
                placeholder="NHID-1000002"
                required
              />
            </label>
            <label>
              <span>Full Name</span>
              <input
                value={patientForm.fullName}
                onChange={(event) => setPatientForm({ ...patientForm, fullName: event.target.value })}
                placeholder="Patient name"
                required
              />
            </label>
            <label>
              <span>Date of Birth</span>
              <input
                type="date"
                value={patientForm.dateOfBirth}
                onChange={(event) => setPatientForm({ ...patientForm, dateOfBirth: event.target.value })}
                required
              />
            </label>
            <label>
              <span>Consent Status</span>
              <select
                value={patientForm.consentStatus}
                onChange={(event) => setPatientForm({ ...patientForm, consentStatus: event.target.value })}
              >
                <option value="active">Consent active</option>
                <option value="revoked">Consent revoked</option>
              </select>
            </label>
            <button className="primary">
              <UserRoundPlus size={18} />
              Save Patient
            </button>
          </form>

          {canGrantAccess && (
            <form className="panel" onSubmit={onGrantPatientAccess}>
              <div className="panel-heading">
                <ShieldCheck size={20} />
                <h2>Grant Patient Access</h2>
              </div>
              <label>
                <span>National Health ID</span>
                <input
                  value={accessGrantForm.nationalHealthId}
                  onChange={(event) => setAccessGrantForm({ ...accessGrantForm, nationalHealthId: event.target.value })}
                  placeholder="NHID-1000001"
                  required
                />
              </label>
              <label>
                <span>Participant Organization</span>
                <select
                  value={accessGrantForm.organizationId}
                  onChange={(event) => setAccessGrantForm({ ...accessGrantForm, organizationId: event.target.value })}
                  required
                >
                  {orgDirectory.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({formatRecordType(org.type)})
                    </option>
                  ))}
                </select>
              </label>
              <p className="helper-text">Use this before another participant searches, uploads, or publishes against the patient.</p>
              <button className="primary">
                <ShieldCheck size={18} />
                Grant Access
              </button>
            </form>
          )}

          <form className="panel" id="records" onSubmit={onCreateRecord}>
            <div className="panel-heading">
              <FilePlus2 size={20} />
              <h2>Publish Record</h2>
            </div>
            <label>
              <span>National Health ID</span>
              <input
                value={recordForm.nationalHealthId}
                onChange={(event) => setRecordForm({ ...recordForm, nationalHealthId: event.target.value })}
                placeholder="NHID-1000001"
                required
              />
            </label>
            <label>
              <span>Record Type</span>
              <select
                value={recordForm.recordType}
                onChange={(event) => setRecordForm({ ...recordForm, recordType: event.target.value })}
              >
                <option value="encounter">Encounter</option>
                <option value="lab_result">Lab result</option>
                <option value="prescription">Prescription</option>
                <option value="claim">Claim</option>
                <option value="immunization">Immunization</option>
              </select>
            </label>
            <label>
              <span>FHIR-like Payload</span>
              <textarea
                value={recordForm.payload}
                onChange={(event) => setRecordForm({ ...recordForm, payload: event.target.value })}
                rows={7}
                spellCheck={false}
              />
            </label>
            <button className="primary">
              <FilePlus2 size={18} />
              Publish Record
            </button>
          </form>
        </section>

        <section className="panel full">
          <div className="section-title">
            <div>
              <h2>Record Lookup</h2>
              <p>Search the exchange by national health ID.</p>
            </div>
            <div className="lookup">
              <label className="sr-only" htmlFor="record-search">
                National Health ID lookup
              </label>
              <input id="record-search" value={searchId} onChange={(event) => setSearchId(event.target.value)} />
              <button onClick={onSearch}>
                <Search size={18} />
                Search
              </button>
            </div>
          </div>
          <div className="table">
            {records.length === 0 ? (
              <p className="empty">No records loaded.</p>
            ) : (
              <>
                <div className="table-head">
                  <span>Type</span>
                  <span>Source</span>
                  <span>Created</span>
                </div>
                {records.map((record) => (
                  <article key={record.id} className="row">
                    <strong>{formatRecordType(record.recordType)}</strong>
                    <span>{record.sourceOrganization}</span>
                    <span>{new Date(record.createdAt).toLocaleString()}</span>
                    <code>{JSON.stringify(record.payload, null, 2)}</code>
                  </article>
                ))}
              </>
            )}
          </div>
        </section>

        <section className="document-workflow" id="documents">
          <form className="panel" onSubmit={onUploadDocument}>
            <div className="panel-heading">
              <UploadCloud size={20} />
              <h2>Upload Patient Document</h2>
            </div>
            <label>
              <span>National Health ID</span>
              <input
                value={documentForm.nationalHealthId}
                onChange={(event) => setDocumentForm({ ...documentForm, nationalHealthId: event.target.value })}
                placeholder="NHID-1000001"
                required
              />
            </label>
            <label>
              <span>Document Type</span>
              <select
                value={documentForm.documentType}
                onChange={(event) => setDocumentForm({ ...documentForm, documentType: event.target.value })}
              >
                <option value="discharge_summary">Discharge summary</option>
                <option value="lab_report">Lab report</option>
                <option value="prescription_scan">Prescription scan</option>
                <option value="insurance_document">Insurance document</option>
                <option value="consent_form">Consent form</option>
                <option value="imaging_report">Imaging report</option>
              </select>
            </label>
            <label>
              <span>Description</span>
              <input
                value={documentForm.description}
                onChange={(event) => setDocumentForm({ ...documentForm, description: event.target.value })}
                placeholder="Short document note"
              />
            </label>
            <label className="file-drop">
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt,.json"
                onChange={(event) => setDocumentForm({ ...documentForm, file: event.target.files?.[0] ?? null })}
              />
              <span>
                <FileText size={18} />
                {documentForm.file ? documentForm.file.name : "Choose PDF, image, text, or JSON file"}
              </span>
              <small>{documentForm.file ? formatBytes(documentForm.file.size) : "The file is sent as multipart form data."}</small>
            </label>
            <button className="primary">
              <UploadCloud size={18} />
              Upload Document
            </button>
          </form>

          <section className="panel document-list-panel">
            <div className="section-title">
              <div>
                <h2>Patient Documents</h2>
                <p>List and download documents associated with a national health ID.</p>
              </div>
              <div className="lookup">
                <label className="sr-only" htmlFor="document-search">
                  National Health ID document lookup
                </label>
                <input
                  id="document-search"
                  value={documentSearchId}
                  onChange={(event) => setDocumentSearchId(event.target.value)}
                />
                <button onClick={onLoadDocuments}>
                  <Search size={18} />
                  Search
                </button>
              </div>
            </div>
            <div className="document-table">
              {documents.length === 0 ? (
                <p className="empty">No documents loaded.</p>
              ) : (
                <>
                  <div className="document-head">
                    <span>Document</span>
                    <span>Type</span>
                    <span>Uploaded</span>
                    <span>Action</span>
                  </div>
                  {documents.map((document) => (
                    <article key={document.id} className="document-row">
                      <div className="document-name">
                        <FileText size={18} />
                        <span>
                          <strong>{document.fileName}</strong>
                          <small>
                            {document.mimeType || "unknown type"} / {formatBytes(document.sizeBytes)}
                          </small>
                        </span>
                      </div>
                      <span>{formatRecordType(document.documentType)}</span>
                      <span>{new Date(document.createdAt).toLocaleString()}</span>
                      <button onClick={() => onDownloadDocument(document)}>
                        <Download size={18} />
                        Download
                      </button>
                    </article>
                  ))}
                </>
              )}
            </div>
          </section>
        </section>

        <section className="panel full" id="audit">
          <div className="section-title">
            <div>
              <h2>Audit Events</h2>
              <p>Agency-only view of access and mutation activity.</p>
            </div>
            <button onClick={onLoadAudits} disabled={!isAgency}>
              <RefreshCcw size={18} />
              Load
            </button>
          </div>
          <div className="table">
            {auditEvents.length === 0 ? (
              <p className="empty">{isAgency ? "No audit events loaded." : "Agency role required for audit events."}</p>
            ) : (
              <>
                <div className="table-head audit-head">
                  <span>Action</span>
                  <span>Resource</span>
                  <span>When</span>
                  <span>Actor / IP</span>
                </div>
                {auditEvents.slice(0, 12).map((event) => (
                  <article key={event.id} className="row audit-row">
                    <strong>{event.action}</strong>
                    <span>{event.resourceType}</span>
                    <span>{new Date(event.createdAt).toLocaleString()}</span>
                    <code>
                      {event.actorOrgId?.slice(0, 8) ?? "system"} / {event.ipAddress ?? "n/a"}
                    </code>
                  </article>
                ))}
              </>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: "blue" | "green" | "amber" | "red";
}) {
  return (
    <article className={`metric ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatRecordType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** exponent;
  return `${amount.toFixed(amount >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

createRoot(document.getElementById("root")!).render(<App />);
