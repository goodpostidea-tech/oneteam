import React, { useState } from 'react';
import { Modal, fieldLabel, fieldInput, btnPrimary, btnSecondary } from './Modal';
import { AgentAvatar } from './AgentAvatar';
import { T } from './styles';
import type { Agent } from '../types';

const FORMATS: { value: string; label: string; desc: string }[] = [
  { value: 'standup', label: '站会', desc: '每位智能体简短汇报，快速同步状态' },
  { value: 'debate', label: '辩论', desc: '围绕议题正反讨论，碰撞出最佳方案' },
  { value: 'chat', label: '闲聊', desc: '自由交流，激发灵感与创意' },
];

interface Props {
  agents: Agent[];
  onSubmit: (title: string, format: string, participants: string[]) => void | Promise<void>;
  onClose: () => void;
}

export const CreateRoundtableModal: React.FC<Props> = ({ agents, onSubmit, onClose }) => {
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState('standup');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [context, setContext] = useState('');

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const canSubmit = title.trim() && selected.size >= 2;

  return (
    <Modal title="新建圆桌会议" onClose={onClose} width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.s16 }}>
        {/* Title */}
        <div>
          <label style={fieldLabel}>会议标题 *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例：本周内容策略讨论"
            style={fieldInput} onFocus={e => e.currentTarget.style.borderColor = T.pri} onBlur={e => e.currentTarget.style.borderColor = T.b2} />
        </div>

        {/* Format */}
        <div>
          <label style={fieldLabel}>会议格式</label>
          <div style={{ display: 'flex', gap: T.s8 }}>
            {FORMATS.map(f => {
              const active = format === f.value;
              return (
                <button key={f.value} onClick={() => setFormat(f.value)} style={{
                  flex: 1, padding: `${T.s10}px ${T.s12}px`, borderRadius: T.r8,
                  border: `1.5px solid ${active ? T.pri : T.b2}`,
                  backgroundColor: active ? T.priLight : T.bg1, cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: T.fs13, fontWeight: T.w6, color: active ? T.pri : T.t1, fontFamily: T.sans }}>{f.label}</div>
                  <div style={{ fontSize: T.fs11, color: T.t3, fontFamily: T.sans, marginTop: 3, lineHeight: 1.4 }}>{f.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Participants */}
        <div>
          <label style={fieldLabel}>参与者（至少 2 位）*</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: T.s8 }}>
            {agents.map(a => {
              const checked = selected.has(a.id);
              return (
                <button key={a.id} onClick={() => toggle(a.id)} style={{
                  display: 'flex', alignItems: 'center', gap: T.s8,
                  padding: `${T.s6}px ${T.s12}px`, borderRadius: T.rFull,
                  border: `1.5px solid ${checked ? T.pri : T.b2}`,
                  backgroundColor: checked ? T.priLight : T.bg1, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}>
                  <AgentAvatar id={a.id} name={a.name} size={24} />
                  <span style={{ fontSize: T.fs12, fontWeight: checked ? T.w6 : T.w4, color: checked ? T.pri : T.t2, fontFamily: T.sans }}>{a.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Context */}
        <div>
          <label style={fieldLabel}>讨论背景（可选）</label>
          <textarea value={context} onChange={e => setContext(e.target.value)} rows={3} placeholder="为会议提供额外背景信息..."
            style={{ ...fieldInput, resize: 'vertical' as const, fontFamily: T.sans }}
            onFocus={e => e.currentTarget.style.borderColor = T.pri} onBlur={e => e.currentTarget.style.borderColor = T.b2} />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: T.s10 }}>
          <button onClick={onClose} style={btnSecondary}>取消</button>
          <button disabled={!canSubmit} onClick={() => { onSubmit(title.trim(), format, [...selected]); onClose(); }}
            style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.5 }}>创建会议</button>
        </div>
      </div>
    </Modal>
  );
};
