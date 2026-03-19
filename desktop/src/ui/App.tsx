import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { NavRail } from './NavRail';
import { SecondaryPanel } from './SecondaryPanel';
import { MainView } from './MainView';
import { CreateProposalModal } from './CreateProposalModal';
import { CreateRoundtableModal } from './CreateRoundtableModal';
import { CreateMemoryModal } from './CreateMemoryModal';
import { ExternalLinkGuard } from './ExternalLinkModal';
import { UpdateNotifier } from './UpdateNotifier';
import { makeGlobalCss, type ThemeId } from './styles';
import { api } from '../api';
import type {
  Mission, Step, Agent, Relationship, Memory,
  RoundtableSession, Proposal, NavKey, CreateProposalInput,
  LlmModelConfig, SettingsTab, HeartbeatStatus,
  OutboxItem, OutboxStats, PublisherInfo, MaterialItem, MaterialStats,
  EventItem, StageAgent,
} from '../types';

export type { Mission, Step, Agent, Relationship, RoundtableSession, NavKey } from '../types';

// ─── Fingerprint: fast hash to detect data changes without full JSON compare ───
function fingerprint(arr: any[]): string {
  if (arr.length === 0) return '0';
  const first = arr[0];
  const last = arr[arr.length - 1];
  const statuses = arr.map((a: any) => a.status || '').join(',');
  return `${arr.length}|${first.id}|${last.id}|${first.updatedAt || first.createdAt || ''}|${last.updatedAt || last.createdAt || ''}|${statuses}`;
}

function useStableArray<T extends { id: number | string }>(initial: T[]): [T[], (next: T[]) => void] {
  const [state, setState] = useState<T[]>(initial);
  const fpRef = useRef('0');
  const set = useCallback((next: T[]) => {
    const fp = fingerprint(next);
    if (fp !== fpRef.current) {
      fpRef.current = fp;
      setState(next);
    }
  }, []);
  return [state, set];
}

export const App: React.FC = () => {
  const [missions, setMissions] = useStableArray<Mission>([]);
  const [missionTotal, setMissionTotal] = useState(0);
  const [steps, setSteps] = useStableArray<Step>([]);
  const [agents, setAgents] = useStableArray<Agent>([]);
  const [rels, setRels] = useStableArray<Relationship>([]);
  const [agentId, setAgentId] = useState('minion');
  const [memories, setMemories] = useStableArray<Memory>([]);
  const [rts, setRts] = useStableArray<RoundtableSession>([]);
  const [rtTotal, setRtTotal] = useState(0);
  const [rtId, setRtId] = useState<number | null>(null);
  const [proposals, setProposals] = useStableArray<Proposal>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dailyStats, setDailyStats] = useState<{ date: string; missions: number; steps: number }[]>([]);
  const [agentStats, setAgentStats] = useState<{ agentId: string; total: number; running: number; succeeded: number; failed: number }[]>([]);
  const [heartbeat, setHeartbeat] = useState<HeartbeatStatus | null>(null);
  const [outboxItems, setOutboxItems] = useState<OutboxItem[]>([]);
  const [outboxTotal, setOutboxTotal] = useState(0);
  const [outboxStats, setOutboxStats] = useState<OutboxStats | null>(null);
  const [selectedOutboxId, setSelectedOutboxId] = useState<number | null>(null);
  const [selectedOutboxKind, setSelectedOutboxKind] = useState<string | null>(null);
  const [outboxFilter, setOutboxFilter] = useState('all');
  const [publishers, setPublishers] = useState<PublisherInfo[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialPage, setMaterialPage] = useState(1);
  const [materialStats, setMaterialStats] = useState<MaterialStats | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [materialFilter, setMaterialFilter] = useState('all');
  const [rssRefreshing, setRssRefreshing] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [stageData, setStageData] = useState<StageAgent[]>([]);

  // Search + filter state
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [pipelineStatus, setPipelineStatus] = useState('all');
  const [outboxSearch, setOutboxSearch] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [roundtableSearch, setRoundtableSearch] = useState('');

  const [themeId, setThemeId] = useState<ThemeId>(
    () => (localStorage.getItem('oneteam-theme') as ThemeId | null) || 'mono',
  );
  const handleSetTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
    localStorage.setItem('oneteam-theme', id);
    document.documentElement.setAttribute('data-theme', id);
    const el = document.getElementById('oneteam-global-css');
    if (el) el.textContent = makeGlobalCss();
  }, []);

  const [nav, setNav] = useState<NavKey>('pipeline');
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('model-config');
  const [llmConfigs, setLlmConfigs] = useState<LlmModelConfig[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<number | null>(null);
  const [showCreateProposal, setShowCreateProposal] = useState(false);
  const [showCreateRoundtable, setShowCreateRoundtable] = useState(false);
  const [showCreateMemory, setShowCreateMemory] = useState(false);

  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;
  const rtIdRef = useRef(rtId);
  rtIdRef.current = rtId;
  const modalOpenRef = useRef(false);
  modalOpenRef.current = showCreateProposal || showCreateRoundtable || showCreateMemory;

  // Refs for search terms to avoid stale closures in polling
  const pipelineSearchRef = useRef('');
  pipelineSearchRef.current = pipelineSearch;
  const pipelineStatusRef = useRef('all');
  pipelineStatusRef.current = pipelineStatus;
  const outboxSearchRef = useRef('');
  outboxSearchRef.current = outboxSearch;
  const materialSearchRef = useRef('');
  materialSearchRef.current = materialSearch;
  const roundtableSearchRef = useRef('');
  roundtableSearchRef.current = roundtableSearch;
  const outboxFilterRef = useRef('all');
  outboxFilterRef.current = outboxFilter;

  const load = useCallback(async (force = false) => {
    if (!force && modalOpenRef.current) return;
    try {
      const pq = pipelineSearchRef.current || undefined;
      const ps = pipelineStatusRef.current;
      const missionStatus = ps !== 'all' ? ps : undefined;
      const proposalStatus = ps === 'pending' ? 'pending' : ps === 'failed' ? 'rejected' : undefined;
      const oq = outboxSearchRef.current || undefined;
      const mq = materialSearchRef.current || undefined;
      const rq = roundtableSearchRef.current || undefined;
      const of = outboxFilterRef.current;
      const ofKind = of !== 'all' ? of : undefined;

      const [missionsRes, c, d, e, f, rtsRes, proposalsRes, ds, as_, hb, lc, obRes, os, pubs, matsRes, matStats, eventsRes, stageRes] = await Promise.all([
        api.getMissions(1, 30, pq, missionStatus), api.getSteps(), api.getAgents(),
        api.getRelationships(), api.getMemories(agentIdRef.current),
        api.getRoundtables(1, 30, rq), api.getProposals(1, 30, pq, proposalStatus),
        api.getDailyStats(), api.getAgentStats(),
        api.getHeartbeatStatus().catch(() => null),
        api.getLlmConfigs().catch(() => null),
        api.getOutbox(1, 30, oq, ofKind).catch(() => ({ items: [] as OutboxItem[], total: 0, page: 1, pageSize: 30 })),
        api.getOutboxStats().catch(() => null),
        api.getPublishers().catch(() => []),
        api.getMaterials(1, 50, mq).catch(() => ({ items: [] as MaterialItem[], total: 0, page: 1, pageSize: 50 })),
        api.getMaterialStats().catch(() => null),
        api.getEvents(1, 50).catch(() => ({ items: [] as EventItem[], total: 0, page: 1, pageSize: 50 })),
        api.getAgentStage().catch(() => [] as StageAgent[]),
      ]);
      setMissions(missionsRes.items); setMissionTotal(missionsRes.total);
      setSteps(c); setAgents(d);
      setRels(e); setMemories(f);
      setRts(rtsRes.items); setRtTotal(rtsRes.total);
      setProposals(proposalsRes.items);
      setDailyStats(ds); setAgentStats(as_); setHeartbeat(hb);
      if (lc) setLlmConfigs(lc);
      setOutboxItems(obRes.items); setOutboxTotal(obRes.total); setOutboxStats(os); setPublishers(pubs);
      setMaterials(matsRes.items); setMaterialTotal(matsRes.total); setMaterialPage(1);
      setMaterialStats(matStats);
      setEvents(eventsRes.items);
      setStageData(stageRes);
      if (rtsRes.items.length > 0 && rtIdRef.current == null) setRtId(rtsRes.items[0].id);
      setError(prev => prev !== null ? null : prev);
    } catch {
      setError('无法连接后端 — 请确认 localhost:4173 正在运行');
    }
  }, []);

  const loadLlmConfigs = useCallback(async () => {
    try { setLlmConfigs(await api.getLlmConfigs()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  useEffect(() => { loadLlmConfigs(); }, [loadLlmConfigs]);
  useEffect(() => { api.getMemories(agentId).then(setMemories).catch(() => {}); }, [agentId]);

  const act = useCallback(async (fn: () => Promise<any>, errMsg: string) => {
    try { setLoading(true); setError(null); await fn(); await load(true); }
    catch { setError(errMsg); }
    finally { setLoading(false); }
  }, [load]);

  const handleCreateProposal = useCallback(async (data: CreateProposalInput) => {
    await act(() => api.createProposal(data), '创建提案失败');
  }, [act]);
  const handleApproveProposal = useCallback(async (id: number) => {
    try {
      setLoading(true); setError(null);
      const res = await api.approveProposal(id);
      await load(true);
      // 自动选中新创建的 mission
      if (res?.mission?.id) {
        setSelectedMissionId(res.mission.id);
        setSelectedProposalId(null);
      }
    } catch { setError('审批失败'); } finally { setLoading(false); }
  }, [load]);
  const handleRejectProposal = useCallback((id: number) => act(() => api.rejectProposal(id), '拒绝失败'), [act]);
  const handleCancelMission = useCallback((id: number) => act(() => api.cancelMission(id), '取消任务失败'), [act]);
  const handleRetryStep = useCallback((id: number) => act(() => api.retryStep(id), '重试步骤失败'), [act]);
  const handleRerunMission = useCallback((title: string, description?: string) =>
    act(() => api.createProposal({ title, description }), '重新执行失败'), [act]);
  const handleCreateMemory = useCallback((content: string, kind: string, confidence?: number, tags?: string[]) =>
    act(() => api.createMemory(agentIdRef.current, { content, kind, confidence, tags }), '写入记忆失败'), [act]);
  const handleDeleteMemory = useCallback((id: number) => act(() => api.deleteMemory(id), '删除记忆失败'), [act]);
  const handleCreateRoundtable = useCallback(async (title: string, format: string, participants: string[]) => {
    try {
      setLoading(true); setError(null);
      const { sessionId } = await api.createRoundtable({ title, format, participants });
      await load(true);
      setRtId(sessionId);
    } catch { setError('创建会议失败'); }
    finally { setLoading(false); }
  }, [load]);

  const handleRenameAgent = useCallback(async (id: string, name: string) => {
    await act(() => api.renameAgent(id, name), '重命名智能体失败');
  }, [act]);

  const handleUpdateOutboxItem = useCallback(async (kind: string, id: number, data: any) => {
    if (kind === 'tweet') await api.updateTweet(id, data);
    else await api.updateArticle(id, data);
    await load(true);
  }, [load]);
  const handleDeleteOutboxItem = useCallback(async (kind: string, id: number) => {
    await api.deleteOutboxItem(kind, id);
    setSelectedOutboxId(null); setSelectedOutboxKind(null);
    await load(true);
  }, [load]);
  const handleSelectOutbox = useCallback((kind: string, id: number) => {
    setSelectedOutboxKind(kind); setSelectedOutboxId(id);
  }, []);
  const handlePublishOutboxItem = useCallback(async (kind: string, id: number, publisherId: string, theme?: string, styledHtml?: string) => {
    await api.publishOutboxItem(kind, id, publisherId, theme, styledHtml);
    await load(true);
  }, [load]);
  const handleBackfillOutbox = useCallback(async () => {
    try { await api.backfillOutbox(); await load(true); } catch { setError('回填失败'); }
  }, [load]);

  const handleCreateMaterial = useCallback(async (data: { url?: string; text?: string; content?: string }) => {
    try { await api.createMaterial(data); await load(true); } catch { setError('创建素材失败'); }
  }, [load]);
  const handleUpdateMaterial = useCallback(async (id: number, data: any) => {
    await api.updateMaterial(id, data); await load(true);
  }, [load]);
  const handleDeleteMaterial = useCallback(async (id: number) => {
    await api.deleteMaterial(id); setSelectedMaterialId(null); await load(true);
  }, [load]);
  const handleCreateProposalFromMaterial = useCallback(async (title: string, description: string) => {
    await act(() => api.createProposal({ title, description }), '从素材创建提案失败');
    setNav('pipeline');
  }, [act]);

  const handleLoadMoreMaterials = useCallback(async () => {
    const nextPage = materialPage + 1;
    try {
      const data = await api.getMaterials(nextPage, 50, materialSearchRef.current || undefined);
      setMaterials(prev => [...prev, ...data.items]);
      setMaterialPage(nextPage);
      setMaterialTotal(data.total);
    } catch { /* ignore */ }
  }, [materialPage]);

  const handleLoadMoreMissions = useCallback(async () => {
    const nextPage = Math.floor(missions.length / 30) + 1;
    const ps = pipelineStatusRef.current;
    try {
      const data = await api.getMissions(nextPage, 30, pipelineSearchRef.current || undefined, ps !== 'all' ? ps : undefined);
      setMissions(prev => [...prev, ...data.items]);
      setMissionTotal(data.total);
    } catch { /* ignore */ }
  }, [missions.length]);

  const handleLoadMoreOutbox = useCallback(async () => {
    const nextPage = Math.floor(outboxItems.length / 30) + 1;
    const of = outboxFilterRef.current;
    try {
      const data = await api.getOutbox(nextPage, 30, outboxSearchRef.current || undefined, of !== 'all' ? of : undefined);
      setOutboxItems(prev => [...prev, ...data.items]);
      setOutboxTotal(data.total);
    } catch { /* ignore */ }
  }, [outboxItems.length]);

  const handleLoadMoreRoundtables = useCallback(async () => {
    const nextPage = Math.floor(rts.length / 30) + 1;
    try {
      const data = await api.getRoundtables(nextPage, 30, roundtableSearchRef.current || undefined);
      setRts(prev => [...prev, ...data.items]);
      setRtTotal(data.total);
    } catch { /* ignore */ }
  }, [rts.length]);

  const handlePipelineSearch = useCallback((q: string) => {
    setPipelineSearch(q);
    const ps = pipelineStatusRef.current;
    const missionStatus = ps !== 'all' ? ps : undefined;
    const proposalStatus = ps === 'pending' ? 'pending' : ps === 'failed' ? 'rejected' : undefined;
    api.getMissions(1, 30, q || undefined, missionStatus).then(r => { setMissions(r.items); setMissionTotal(r.total); }).catch(() => {});
    api.getProposals(1, 30, q || undefined, proposalStatus).then(r => { setProposals(r.items); }).catch(() => {});
  }, []);

  const handlePipelineStatusFilter = useCallback((status: string) => {
    setPipelineStatus(status);
    const q = pipelineSearchRef.current || undefined;
    const missionStatus = status !== 'all' ? status : undefined;
    const proposalStatus = status === 'pending' ? 'pending' : status === 'failed' ? 'rejected' : undefined;
    api.getMissions(1, 30, q, missionStatus).then(r => { setMissions(r.items); setMissionTotal(r.total); }).catch(() => {});
    api.getProposals(1, 30, q, proposalStatus).then(r => { setProposals(r.items); }).catch(() => {});
  }, []);

  const handleOutboxSearch = useCallback((q: string) => {
    setOutboxSearch(q);
    const of = outboxFilterRef.current;
    api.getOutbox(1, 30, q || undefined, of !== 'all' ? of : undefined).then(r => { setOutboxItems(r.items); setOutboxTotal(r.total); }).catch(() => {});
  }, []);

  const handleMaterialSearch = useCallback((q: string) => {
    setMaterialSearch(q);
    api.getMaterials(1, 50, q || undefined).then(r => { setMaterials(r.items); setMaterialTotal(r.total); setMaterialPage(1); }).catch(() => {});
  }, []);

  const handleRoundtableSearch = useCallback((q: string) => {
    setRoundtableSearch(q);
    api.getRoundtables(1, 30, q || undefined).then(r => { setRts(r.items); setRtTotal(r.total); }).catch(() => {});
  }, []);

  const handleRefreshRss = useCallback(async () => {
    setRssRefreshing(true);
    try { await api.fetchRss(); await load(true); }
    catch { setError('RSS 刷新失败'); }
    finally { setRssRefreshing(false); }
  }, [load]);

  const handleAddLlmConfig = useCallback(async (data: any) => { await api.addLlmConfig(data); await loadLlmConfigs(); }, [loadLlmConfigs]);
  const handleUpdateLlmConfig = useCallback(async (id: string, data: any) => { await api.updateLlmConfig(id, data); await loadLlmConfigs(); }, [loadLlmConfigs]);
  const handleDeleteLlmConfig = useCallback(async (id: string) => { await api.deleteLlmConfig(id); await loadLlmConfigs(); }, [loadLlmConfigs]);
  const handleSetDefaultLlmConfig = useCallback(async (id: string) => { await api.setDefaultLlmConfig(id); await loadLlmConfigs(); }, [loadLlmConfigs]);
  const handleAgentsChanged = useCallback(() => { load(true); }, [load]);

  const pendingProposals = useMemo(() => proposals.filter(p => p.status === 'pending'), [proposals]);
  const handleNav = useCallback((key: NavKey) => { setNav(key); if (key === 'settings') setSettingsTab('model-config'); }, []);
  const handleOpenCreateProposal = useCallback(() => setShowCreateProposal(true), []);
  const handleCloseCreateProposal = useCallback(() => setShowCreateProposal(false), []);
  const handleOpenCreateRoundtable = useCallback(() => setShowCreateRoundtable(true), []);
  const handleCloseCreateRoundtable = useCallback(() => setShowCreateRoundtable(false), []);
  const handleOpenCreateMemory = useCallback(() => setShowCreateMemory(true), []);
  const handleCloseCreateMemory = useCallback(() => setShowCreateMemory(false), []);
  const handleSubmitMemory = useCallback((content: string, kind: string, confidence: number, tags: string[]) => {
    handleCreateMemory(content, kind, confidence, tags);
  }, [handleCreateMemory]);

  const counts = useMemo(() => ({
    agents: agents.length, pipeline: missions.length,
    outbox: outboxItems.length, materials: materialTotal || materials.length,
    roundtable: rts.length, signal: events.length, settings: 0, theme: 0,
  }), [agents.length, missions.length, outboxItems.length, materialTotal, materials.length, rts.length, events.length]);

  return (
    <>
      {/* Electron 窗口拖动区域 */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 36, zIndex: 9999,
        // @ts-ignore -- Electron CSS property
        WebkitAppRegion: 'drag',
      }} />
      <div className="flex h-screen overflow-hidden bg-bg-base">
        <NavRail active={nav} onNav={handleNav} counts={counts} pendingProposals={pendingProposals.length} outboxDraftCount={outboxStats?.draft || 0} />
        <SecondaryPanel
          nav={nav}
          agents={agents} activeAgentId={agentId} onSelectAgent={setAgentId}
          missions={missions} steps={steps} selectedMissionId={selectedMissionId} onSelectMission={setSelectedMissionId}
          selectedProposalId={selectedProposalId} onSelectProposal={setSelectedProposalId}
          roundtables={rts} activeRoundtableId={rtId} onSelectRoundtable={setRtId}
          proposals={proposals} pendingCount={pendingProposals.length}
          memoryCount={memories.length} loading={loading}
          onCreateProposal={handleOpenCreateProposal}
          onCreateRoundtable={handleOpenCreateRoundtable}
          onAddMemory={handleOpenCreateMemory}
          settingsTab={settingsTab} onSelectSettingsTab={setSettingsTab}
          modelConfigCount={llmConfigs.length}
          outboxItems={outboxItems} outboxStats={outboxStats}
          selectedOutboxId={selectedOutboxId} outboxKind={selectedOutboxKind}
          onSelectOutbox={handleSelectOutbox}
          outboxFilter={outboxFilter} onSetOutboxFilter={setOutboxFilter}
          onBackfillOutbox={handleBackfillOutbox}
          materials={materials} materialStats={materialStats}
          selectedMaterialId={selectedMaterialId} onSelectMaterial={setSelectedMaterialId}
          materialFilter={materialFilter} onSetMaterialFilter={setMaterialFilter}
          onCreateMaterial={handleCreateMaterial}
          onRefreshRss={handleRefreshRss}
          rssRefreshing={rssRefreshing}
          materialTotal={materialTotal}
          onLoadMoreMaterials={handleLoadMoreMaterials}
          pipelineSearch={pipelineSearch}
          onPipelineSearch={handlePipelineSearch}
          pipelineStatus={pipelineStatus}
          onPipelineStatusFilter={handlePipelineStatusFilter}
          missionTotal={missionTotal}
          onLoadMoreMissions={handleLoadMoreMissions}
          outboxSearch={outboxSearch}
          onOutboxSearch={handleOutboxSearch}
          outboxTotal={outboxTotal}
          onLoadMoreOutbox={handleLoadMoreOutbox}
          roundtableSearch={roundtableSearch}
          onRoundtableSearch={handleRoundtableSearch}
          roundtableTotal={rtTotal}
          onLoadMoreRoundtables={handleLoadMoreRoundtables}
          materialSearch={materialSearch}
          onMaterialSearch={handleMaterialSearch}
        />
        <MainView
          nav={nav}
          agents={agents} activeAgentId={agentId} relationships={rels} memories={memories}
          missions={missions} steps={steps} selectedMissionId={selectedMissionId} selectedProposalId={selectedProposalId}
          roundtables={rts} activeRoundtableId={rtId}
          proposals={proposals} dailyStats={dailyStats} agentStats={agentStats} heartbeat={heartbeat} error={error}
          onApproveProposal={handleApproveProposal}
          onRejectProposal={handleRejectProposal}
          onCancelMission={handleCancelMission}
          onRetryStep={handleRetryStep}
          onRerunMission={handleRerunMission}
          onCreateMemory={handleCreateMemory}
          onDeleteMemory={handleDeleteMemory}
          onRenameAgent={handleRenameAgent}
          settingsTab={settingsTab}
          llmConfigs={llmConfigs}
          onAddLlmConfig={handleAddLlmConfig}
          onUpdateLlmConfig={handleUpdateLlmConfig}
          onDeleteLlmConfig={handleDeleteLlmConfig}
          onSetDefaultLlmConfig={handleSetDefaultLlmConfig}
          onAgentsChanged={handleAgentsChanged}
          themeId={themeId}
          onSetTheme={handleSetTheme}
          materials={materials}
          selectedMaterialId={selectedMaterialId}
          onUpdateMaterial={handleUpdateMaterial}
          onDeleteMaterial={handleDeleteMaterial}
          onCreateProposalFromMaterial={handleCreateProposalFromMaterial}
          outboxItems={outboxItems}
          selectedOutboxId={selectedOutboxId}
          selectedOutboxKind={selectedOutboxKind}
          onUpdateOutboxItem={handleUpdateOutboxItem}
          onDeleteOutboxItem={handleDeleteOutboxItem}
          onPublishOutboxItem={handlePublishOutboxItem}
          publishers={publishers}
          onSelectMission={(id) => { setNav('pipeline'); setSelectedMissionId(id); }}
          events={events}
          stageData={stageData}
        />
      </div>
      {showCreateProposal && (
        <CreateProposalModal onSubmit={handleCreateProposal} onClose={handleCloseCreateProposal} />
      )}
      {showCreateRoundtable && (
        <CreateRoundtableModal agents={agents} onSubmit={handleCreateRoundtable} onClose={handleCloseCreateRoundtable} />
      )}
      {showCreateMemory && (
        <CreateMemoryModal agent={agents.find(a => a.id === agentId) || { id: agentId, name: agentId, role: '', style: '' }} onSubmit={handleSubmitMemory} onClose={handleCloseCreateMemory} />
      )}
      <ExternalLinkGuard />
      <UpdateNotifier />
    </>
  );
};
