// ─── Domain types shared across the desktop app ───

export interface Agent {
  id: string;
  name: string;
  role: string;
  style: string;
  catchphrase?: string;
  perspective?: string;
  parentId?: string;
}

export interface Proposal {
  id: number;
  agentId: string;
  title: string;
  description?: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  rejectReason?: string | null;
  source: string;
  materialId?: number | null;
  proposedSteps: ProposedStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ProposedStep {
  kind: StepKind;
  payload?: unknown;
}

export type StepKind = 'draft_social' | 'write_article' | 'crawl' | 'analyze' | 'roundtable';
export type StepStatus = 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Mission {
  id: number;
  proposalId?: number | null;
  title: string;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  steps?: Step[];
}

export interface Step {
  id: number;
  missionId: number;
  kind: string;
  status: string;
  payload?: unknown;
  result?: unknown;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface EventItem {
  id: number;
  agentId?: string | null;
  kind: string;
  title: string;
  summary?: string | null;
  tags: string[];
  payload?: unknown;
  createdAt: string;
}

export interface Relationship {
  id: number;
  agentA: string;
  agentB: string;
  score: number;
}

export interface Memory {
  id: number;
  agentId: string;
  kind: string;
  content: string;
  tags: string[];
  confidence: number;
  createdAt: string;
}

export interface RoundtableSession {
  id: number;
  title: string;
  format: string;
  participants: string;
  transcript?: string;
  status?: string;       // running | finished
  totalRounds?: number;
  createdAt: string;
}

export type NavKey = 'agents' | 'pipeline' | 'signal' | 'outbox' | 'materials' | 'roundtable' | 'theme' | 'settings';

export interface OutboxItem {
  id: number;
  kind: 'tweet' | 'article';
  platform?: string;
  stepId?: number | null;
  missionId?: number | null;
  title?: string;
  content: string;
  status: 'draft' | 'approved' | 'exported' | 'archived';
  exportedAt?: string | null;
  createdAt: string;
}

export interface OutboxStats {
  total: number;
  draft: number;
  approved: number;
  exported: number;
  archived: number;
  tweet: number;
  article: number;
}

export interface MaterialItem {
  id: number;
  kind: 'url' | 'note';
  url?: string;
  title?: string;
  summary?: string;
  content: string;
  tags: string[];
  source: string;        // "manual" | RSS feed name
  summaryStatus: string; // "pending" | "done" | "failed"
  status: string;
  createdAt: string;
}

export interface MaterialStats {
  total: number;
  new: number;
  used: number;
  archived: number;
  sources: string[];
}

export interface PublisherInfo {
  id: string;
  name: string;
  ready: boolean;  // baseUrl 已配置
}

// ─── API input types ───

export interface PlanStepInput {
  kind: string;
  agent: string;
  agentName: string;
  reason: string;
  platform?: string;
}

export interface PlanResultInput {
  steps: PlanStepInput[];
  confidence: number;
  method: 'rule' | 'llm';
}

export interface CreateProposalInput {
  title: string;
  description?: string;
  platforms?: string[];
  /** 用户确认过的执行计划，提供时后端将使用此计划而非重新规划 */
  planResult?: PlanResultInput;
}

export interface CreateMemoryInput {
  kind: string;
  content: string;
  tags?: string[];
  confidence?: number;
}

export interface CreateRoundtableInput {
  title: string;
  format: string;
  participants: string[];
}

// ─── Settings types ───

export interface LlmModelConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  apiKey: string;     // masked
  baseUrl: string;
  isDefault: boolean;
  hasKey: boolean;
  type?: 'text' | 'image';
}

export interface LlmModelConfigInput {
  name?: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  isDefault?: boolean;
  type?: 'text' | 'image';
}

export type SettingsTab = 'model-config' | 'tools-config' | 'policy' | 'triggers' | 'agents-config' | 'rss-config' | 'about';

export interface RssFeedConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  lastFetchedAt: string | null;
}

export interface ToolProviderConfig {
  id: string;
  kind: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  priority: number;
  hasKey: boolean;
}

export interface AgentConfigDetail {
  defaults: Agent & { catchphrase: string; perspective: string };
  overrides: {
    name?: string | null;
    role?: string | null;
    style?: string | null;
    catchphrase?: string | null;
    perspective?: string | null;
    customSystemPrompt?: string | null;
    modelId?: string | null;
  };
  merged: Agent & { catchphrase: string; perspective: string; customSystemPrompt: string | null; modelId: string | null };
}

export interface PolicyMap {
  auto_approve: { enabled: boolean };
  daily_quota: { limit: number };
  cap_gates: Record<string, number>;
  [key: string]: unknown;
}

export interface TriggerRule {
  id: number;
  name: string;
  kind: string;
  eventFilter: any;
  enabled: boolean;
  cooldownSec: number;
  lastFiredAt: string | null;
}

export interface HeartbeatStatus {
  lastRunAt: string | null;
  lastResult: 'ok' | 'partial' | 'error';
  subsystems: Record<string, { ok: boolean; error?: string }>;
}

export interface StageAgent extends Agent {
  runningSteps: number;
  memoryCount: number;
  recentEvent: { title: string; createdAt: string } | null;
  topRelationships: { otherId: string; score: number }[];
}
