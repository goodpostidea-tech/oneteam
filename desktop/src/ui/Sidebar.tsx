import React, { useState, CSSProperties } from 'react';
import { T, agentHue } from './styles';
import { AgentAvatar } from './AgentAvatar';

interface Agent { id: string; name: string; role: string; style: string; }
interface Relationship { id: number; agentA: string; agentB: string; score: number; }

interface Props {
  agents: Agent[];
  relationships: Relationship[];
  activeAgentId: string;
  onSelectAgent: (id: string) => void;
  memoryCount: number;
  loading: boolean;
  onCreateTestProposal: () => void;
  onCreateTestRoundtable: () => void;
  onAddTestMemory: () => void;
}

const secLabel: CSSProperties = {
  fontSize: T.fs10, fontWeight: T.w6, color: T.t4,
  textTransform: 'uppercase', letterSpacing: '1.5px',
  fontFamily: T.sans, padding: `${T.s14}px ${T.s16}px ${T.s8}px`,
};

export const Sidebar: React.FC<Props> = ({
  agents, relationships, activeAgentId, onSelectAgent,
  memoryCount, loading,
  onCreateTestProposal, onCreateTestRoundtable, onAddTestMemory,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuHover, setMenuHover] = useState(-1);

  const menuItems = [
    { icon: '◇', label: '新建提案', desc: '创建测试提案进入审批流', color: T.amber, onClick: onCreateTestProposal },
    { icon: '◎', label: '新建会议', desc: '启动智能体会议讨论', color: T.violet, onClick: onCreateTestRoundtable },
    { icon: '◆', label: '写入记忆', desc: `为 ${activeAgentId} 添加记忆`, color: T.pink, onClick: onAddTestMemory },
  ];

  return (
    <div style={{
      width: 272, display: 'flex', flexDirection: 'column',
      backgroundColor: T.bg1, borderRight: `1px solid ${T.b1}`,
      flexShrink: 0, position: 'relative',
      boxShadow: '1px 0 8px rgba(0,0,0,0.03)',
    }}>

      {/* ─── Header (draggable title bar area) ─── */}
      <div style={{
        padding: `${T.s20}px ${T.s16}px ${T.s14}px`,
        paddingTop: 36 + T.s12, // extra space for hidden title bar overlay
        background: T.gradHeader,
        borderRadius: `0 0 ${T.r20}px ${T.r20}px`,
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(251,146,60,0.15)',
        // @ts-ignore — Electron-specific CSS for window dragging
        WebkitAppRegion: 'drag',
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: T.s10 }}>
              <div style={{
                width: 9, height: 9, borderRadius: '50%',
                background: 'rgba(255,255,255,0.9)',
                boxShadow: '0 0 12px rgba(255,255,255,0.5)',
                animation: 'breathe 3s ease infinite',
              }} />
              <span style={{
                fontSize: T.fs16, fontWeight: T.w7, color: '#fff',
                fontFamily: T.sans, letterSpacing: '0.3px',
                textShadow: '0 1px 4px rgba(0,0,0,0.15)',
              }}>
                OneTeam
              </span>
            </div>
            <button onClick={() => setMenuOpen(!menuOpen)} style={{
              width: 32, height: 32, borderRadius: T.r10,
              border: '1.5px solid rgba(255,255,255,0.3)',
              backgroundColor: menuOpen ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
              color: '#fff', fontSize: T.fs16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', fontWeight: T.w5,
              // @ts-ignore
              WebkitAppRegion: 'no-drag',
            }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = menuOpen ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)'}
            >
              +
            </button>
          </div>
          <div style={{
            fontSize: T.fs12, color: 'rgba(255,255,255,0.75)', fontFamily: T.sans,
            marginTop: T.s6, paddingLeft: 19,
          }}>
            {agents.length} 智能体在线 · {memoryCount} 条记忆
          </div>
        </div>
      </div>

      {/* ─── Dropdown ─── */}
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
          <div style={{
            position: 'absolute', top: 80, left: T.s12, right: T.s12, zIndex: 100,
            padding: T.s6, backgroundColor: T.bg1,
            border: `1px solid ${T.b2}`, borderRadius: T.r16,
            boxShadow: T.sh3, animation: 'fadeUp 0.18s ease both',
          }}>
            {menuItems.map((item, i) => (
              <button key={i}
                onClick={() => { item.onClick(); setMenuOpen(false); }}
                disabled={loading}
                onMouseEnter={() => setMenuHover(i)}
                onMouseLeave={() => setMenuHover(-1)}
                style={{
                  display: 'flex', alignItems: 'center', gap: T.s12,
                  width: '100%', textAlign: 'left',
                  padding: `${T.s10}px ${T.s12}px`,
                  border: 'none', borderRadius: T.r12,
                  backgroundColor: menuHover === i ? T.bg2 : 'transparent',
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.5 : 1, transition: 'background-color 0.12s',
                }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: T.r12, flexShrink: 0,
                  background: `linear-gradient(145deg, ${item.color}15, ${item.color}08)`,
                  border: `1.5px solid ${item.color}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: T.fs14, color: item.color,
                }}>
                  {item.icon}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: T.fs13, fontWeight: T.w6, color: T.t1, fontFamily: T.sans, lineHeight: 1.3 }}>
                    {loading ? '处理中...' : item.label}
                  </div>
                  <div style={{ fontSize: T.fs11, color: T.t4, fontFamily: T.sans, lineHeight: 1.4, marginTop: 2 }}>
                    {item.desc}
                  </div>
                </div>
                <span style={{ color: T.t5, fontSize: T.fs14 }}>›</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ─── Agents ─── */}
      <div style={secLabel}>智能体</div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${T.s10}px ${T.s10}px` }}>
        {agents.map(a => {
          const isActive = a.id === activeAgentId;
          const hue = agentHue(a.id);
          return (
            <div key={a.id} onClick={() => onSelectAgent(a.id)} style={{
              display: 'flex', alignItems: 'center', gap: T.s12,
              padding: `${T.s10}px ${T.s10}px`,
              marginBottom: T.s4, borderRadius: T.r14, cursor: 'pointer',
              background: isActive ? `linear-gradient(145deg, ${hue}0d, ${hue}05)` : 'transparent',
              border: `1.5px solid ${isActive ? `${hue}1a` : 'transparent'}`,
              boxShadow: isActive ? `0 2px 12px ${hue}08` : 'none',
              transition: 'all 0.18s ease',
            }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.backgroundColor = T.bg2; e.currentTarget.style.borderColor = T.b1; }}}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}}
            >
              <AgentAvatar id={a.id} name={a.name} size={38} online active={isActive} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: T.fs14, fontWeight: isActive ? T.w6 : T.w5,
                  color: isActive ? T.t1 : T.t2, fontFamily: T.sans,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3,
                }}>
                  {a.name}
                </div>
                <div style={{
                  fontSize: T.fs12, color: T.t4, fontFamily: T.sans,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.35, marginTop: 2,
                }}>
                  {a.role}
                </div>
              </div>
              {isActive && (
                <div style={{
                  padding: '2px 8px', borderRadius: T.rFull,
                  backgroundColor: `${hue}12`, border: `1px solid ${hue}20`,
                  fontSize: T.fs10, color: hue, fontFamily: T.mono, fontWeight: T.w5,
                  whiteSpace: 'nowrap',
                }}>
                  选中
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Relationships ─── */}
      {relationships.length > 0 && (
        <div style={{
          margin: `0 ${T.s10}px ${T.s10}px`,
          padding: `${T.s12}px ${T.s14}px`,
          backgroundColor: T.bg2, borderRadius: T.r16,
          boxShadow: T.sh0,
        }}>
          <div style={{
            fontSize: T.fs10, fontWeight: T.w6, color: T.t4,
            textTransform: 'uppercase' as const, letterSpacing: '1.5px',
            fontFamily: T.sans, marginBottom: T.s10,
          }}>
            关系网络
          </div>
          {relationships.slice(0, 5).map(r => {
            const pct = Math.max(0, Math.min(1, (r.score + 1) / 2)) * 100;
            const c = r.score > 0.3 ? T.priDeep : r.score > -0.3 ? T.amber : T.red;
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: T.s8,
                marginBottom: T.s6, fontSize: T.fs11, color: T.t3, fontFamily: T.sans,
              }}>
                <div style={{ display: 'flex', flexShrink: 0 }}>
                  {[r.agentA, r.agentB].map((name, i) => (
                    <div key={name} style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: `linear-gradient(135deg, ${agentHue(name)}20, ${agentHue(name)}0c)`,
                      border: `1.5px solid ${agentHue(name)}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '8px', color: agentHue(name), fontWeight: T.w7,
                      marginLeft: i > 0 ? -5 : 0, zIndex: 2 - i,
                    }}>
                      {name[0]?.toUpperCase()}
                    </div>
                  ))}
                </div>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.agentA} · {r.agentB}
                </span>
                <div style={{ width: 44, height: 4, borderRadius: T.rFull, backgroundColor: `${c}12`, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: T.rFull, backgroundColor: c, transition: 'width 0.6s' }} />
                </div>
                <span style={{ fontSize: T.fs10, color: c, fontFamily: T.mono, fontWeight: T.w5, width: 30, textAlign: 'right' as const }}>
                  {r.score > 0 ? '+' : ''}{r.score.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
