import axios from 'axios';
import type {
  Agent, Proposal, Mission, Step, EventItem, Relationship,
  Memory, RoundtableSession, CreateProposalInput, CreateMemoryInput, CreateRoundtableInput,
  LlmModelConfig, LlmModelConfigInput, TriggerRule, HeartbeatStatus, AgentConfigDetail, ToolProviderConfig,
  OutboxItem, OutboxStats, PublisherInfo, MaterialItem, MaterialStats,
  RssFeedConfig, StageAgent,
} from './types';

const BASE = 'http://127.0.0.1:4173';
const http = axios.create({ baseURL: BASE, timeout: 10000 });

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const api = {
  // ─── READ (paginated) ───
  getAgents:        () => http.get<Agent[]>('/api/agents').then(r => r.data),
  getMissions:      (page = 1, pageSize = 30, q?: string, status?: string) =>
    http.get<Paginated<Mission>>('/api/missions', { params: { page, pageSize, q: q || undefined, status: status || undefined } }).then(r => r.data),
  getProposals:     (page = 1, pageSize = 30, q?: string, status?: string) =>
    http.get<Paginated<Proposal>>('/api/proposals', { params: { page, pageSize, q: q || undefined, status: status || undefined } }).then(r => r.data),
  getSteps:         () => http.get<Step[]>('/api/steps').then(r => r.data),
  getEvents:        (page = 1, pageSize = 50, kind?: string) =>
    http.get<Paginated<EventItem>>('/api/events', { params: { page, pageSize, kind: kind || undefined } }).then(r => r.data),
  getAgentStage:    () => http.get<StageAgent[]>('/api/agents/stage').then(r => r.data),
  getRelationships: () => http.get<Relationship[]>('/api/relationships').then(r => r.data),
  getMemories:      (agentId: string) => http.get<Memory[]>(`/api/memory/${agentId}`).then(r => r.data),
  getRoundtables:   (page = 1, pageSize = 30, q?: string) =>
    http.get<Paginated<RoundtableSession>>('/api/roundtable/sessions', { params: { page, pageSize, q: q || undefined } }).then(r => r.data),

  // ─── SYSTEM ───
  getHeartbeatStatus:  () => http.get<HeartbeatStatus>('/api/heartbeat/status').then(r => r.data),
  getTriggers:         () => http.get<TriggerRule[]>('/api/triggers').then(r => r.data),
  updateTrigger:       (id: number, data: Partial<{ enabled: boolean; cooldownSec: number }>) => http.patch<TriggerRule>(`/api/triggers/${id}`, data).then(r => r.data),
  getPolicies:         () => http.get<{ key: string; value: any }[]>('/api/settings/policy').then(r => r.data),
  updatePolicy:        (key: string, value: any) => http.put(`/api/settings/policy/${key}`, { value }).then(r => r.data),
  getWechatThemes:     () => http.get<{ id: string; name: string }[]>('/api/settings/wechat-themes').then(r => r.data),

  // ─── STATS ───
  getDailyStats:    (year?: number, month?: number) => http.get<{ date: string; missions: number; steps: number }[]>('/api/stats/daily', { params: { year, month } }).then(r => r.data),
  getAgentStats:    () => http.get<{ agentId: string; total: number; running: number; succeeded: number; failed: number }[]>('/api/stats/agents').then(r => r.data),

  // ─── AGENTS ───
  renameAgent:      (id: string, name: string) => http.patch<Agent>(`/api/agents/${id}`, { name }).then(r => r.data),

  // ─── PROPOSALS ───
  createProposal:   (data: CreateProposalInput) => http.post<Proposal>('/api/proposals', data).then(r => r.data),
  approveProposal:  (id: number) => http.patch(`/api/proposals/${id}/approve`).then(r => r.data),
  rejectProposal:   (id: number) => http.patch(`/api/proposals/${id}/reject`).then(r => r.data),

  // ─── MISSIONS ───
  cancelMission:    (id: number) => http.patch(`/api/missions/${id}/cancel`).then(r => r.data),
  retryStep:        (id: number) => http.patch(`/api/steps/${id}/retry`).then(r => r.data),

  // ─── PLAN PREVIEW ───
  planSteps:        (title: string, description?: string, platforms?: string[]) => http.post('/api/proposals/plan', { title, description, platforms }).then(r => r.data),

  // ─── MEMORY ───
  createMemory:     (agentId: string, data: CreateMemoryInput) => http.post<Memory>(`/api/memory/${agentId}`, data).then(r => r.data),
  deleteMemory:     (id: number) => http.delete(`/api/memory/${id}`).then(r => r.data),

  // ─── ROUNDTABLE ───
  createRoundtable: (data: CreateRoundtableInput) => http.post<{ sessionId: number }>('/api/roundtable/sessions', data).then(r => r.data),

  // ─── OUTBOX (paginated) ───
  getOutbox:        (page = 1, pageSize = 30, q?: string, kind?: string, status?: string) =>
    http.get<Paginated<OutboxItem>>('/api/outbox', { params: { page, pageSize, q: q || undefined, kind: kind || undefined, status: status || undefined } }).then(r => r.data),
  getOutboxStats:   () => http.get<OutboxStats>('/api/outbox/stats').then(r => r.data),
  updateTweet:      (id: number, data: { content?: string; status?: string }) => http.put<OutboxItem>(`/api/outbox/tweet/${id}`, data).then(r => r.data),
  updateArticle:    (id: number, data: { title?: string; content?: string; status?: string }) => http.put<OutboxItem>(`/api/outbox/article/${id}`, data).then(r => r.data),
  deleteOutboxItem: (kind: string, id: number) => http.delete(`/api/outbox/${kind}/${id}`).then(r => r.data),
  backfillOutbox:   () => http.post<{ ok: boolean; scanned: number; created: number }>('/api/outbox/backfill').then(r => r.data),
  getPublishers:    () => http.get<PublisherInfo[]>('/api/publishers').then(r => r.data),
  publishOutboxItem: (kind: string, id: number, publisherId: string, theme?: string, styledHtml?: string) => http.post(`/api/outbox/${kind}/${id}/publish`, { publisherId, theme, styledHtml }).then(r => r.data),
  previewWechatHtml: (markdown: string, theme?: string) => http.post<{ html: string }>('/api/wechat-preview', { markdown, theme }).then(r => r.data),

  // ─── MATERIALS (paginated) ───
  getMaterials:     (page = 1, pageSize = 50, q?: string) =>
    http.get<Paginated<MaterialItem>>('/api/materials', { params: { page, pageSize, q: q || undefined } }).then(r => r.data),
  getMaterialStats: () => http.get<MaterialStats>('/api/materials/stats').then(r => r.data),
  createMaterial:   (data: { url?: string; text?: string; content?: string }) => http.post<MaterialItem>('/api/materials', data, { timeout: 60000 }).then(r => r.data),
  updateMaterial:   (id: number, data: any) => http.put<MaterialItem>(`/api/materials/${id}`, data).then(r => r.data),
  deleteMaterial:   (id: number) => http.delete(`/api/materials/${id}`).then(r => r.data),

  // ─── SETTINGS: Agent configs ───
  getAgentConfigs:      () => http.get<Agent[]>('/api/settings/agents').then(r => r.data),
  getAgentConfigDetail: (id: string) => http.get<AgentConfigDetail>(`/api/settings/agents/${id}`).then(r => r.data),
  updateAgentConfig:    (id: string, data: Record<string, any>) => http.put<AgentConfigDetail>(`/api/settings/agents/${id}`, data).then(r => r.data),
  resetAgentConfig:     (id: string) => http.delete<AgentConfigDetail>(`/api/settings/agents/${id}`).then(r => r.data),

  // ─── SETTINGS: Tool configs ───
  getToolConfigs:       () => http.get<ToolProviderConfig[]>('/api/settings/tools').then(r => r.data),
  addToolConfig:        (data: Partial<ToolProviderConfig>) => http.post<ToolProviderConfig>('/api/settings/tools', data).then(r => r.data),
  updateToolConfig:     (id: string, data: Partial<ToolProviderConfig>) => http.put<ToolProviderConfig>(`/api/settings/tools/${id}`, data).then(r => r.data),
  deleteToolConfig:     (id: string) => http.delete(`/api/settings/tools/${id}`).then(r => r.data),

  // ─── SETTINGS: LLM model configs ───
  getLlmConfigs:       () => http.get<LlmModelConfig[]>('/api/settings/llm').then(r => r.data),
  addLlmConfig:        (data: LlmModelConfigInput) => http.post<LlmModelConfig>('/api/settings/llm', data).then(r => r.data),
  updateLlmConfig:     (id: string, data: Partial<LlmModelConfigInput>) => http.put<LlmModelConfig>(`/api/settings/llm/${id}`, data).then(r => r.data),
  deleteLlmConfig:     (id: string) => http.delete(`/api/settings/llm/${id}`).then(r => r.data),
  setDefaultLlmConfig: (id: string) => http.patch(`/api/settings/llm/${id}/default`).then(r => r.data),

  // ─── RSS Feeds ───
  getRssFeeds:       () => http.get<RssFeedConfig[]>('/api/rss/feeds').then(r => r.data),
  addRssFeed:        (data: { name: string; url: string }) => http.post<RssFeedConfig>('/api/rss/feeds', data).then(r => r.data),
  updateRssFeed:     (id: string, data: Partial<RssFeedConfig>) => http.put<RssFeedConfig>(`/api/rss/feeds/${id}`, data).then(r => r.data),
  deleteRssFeed:     (id: string) => http.delete(`/api/rss/feeds/${id}`).then(r => r.data),
  fetchRss:          () => http.post<{ fetched: number }>('/api/rss/fetch', {}, { timeout: 60000 }).then(r => r.data),
};

export interface StreamCallbacks {
  onTurnStart?: (data: { sessionId: number; round: number; speakerId: string; speakerName: string }) => void;
  onToken?: (data: { sessionId: number; token: string }) => void;
  onTurnEnd?: (data: { sessionId: number; round: number; fullText: string; speakerId: string; speakerName: string }) => void;
  onDone?: (data: { sessionId: number }) => void;
  onError?: (data: { sessionId: number; error: string }) => void;
}

export function streamRoundtable(sessionId: number, callbacks: StreamCallbacks): () => void {
  const es = new EventSource(`${BASE}/api/roundtable/sessions/${sessionId}/stream`);

  es.addEventListener('turn_start', (e) => {
    callbacks.onTurnStart?.(JSON.parse(e.data));
  });
  es.addEventListener('token', (e) => {
    callbacks.onToken?.(JSON.parse(e.data));
  });
  es.addEventListener('turn_end', (e) => {
    callbacks.onTurnEnd?.(JSON.parse(e.data));
  });
  es.addEventListener('done', (e) => {
    callbacks.onDone?.(JSON.parse(e.data));
    es.close();
  });
  es.addEventListener('error', (e) => {
    if ((e as MessageEvent).data) {
      callbacks.onError?.(JSON.parse((e as MessageEvent).data));
    }
    es.close();
  });

  return () => es.close();
}
