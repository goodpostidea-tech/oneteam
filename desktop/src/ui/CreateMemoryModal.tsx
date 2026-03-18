import React, { useState } from 'react';
import { Modal, fieldLabel, fieldInput, fieldSelect, btnPrimary, btnSecondary } from './Modal';
import { AgentAvatar } from './AgentAvatar';
import { T } from './styles';
import type { Agent } from '../types';

const KINDS: { value: string; label: string }[] = [
  { value: 'insight', label: '洞察 insight' },
  { value: 'pattern', label: '规律 pattern' },
  { value: 'strategy', label: '策略 strategy' },
  { value: 'preference', label: '偏好 preference' },
  { value: 'lesson', label: '教训 lesson' },
];

interface Props {
  agent: Agent;
  onSubmit: (content: string, kind: string, confidence: number, tags: string[]) => void;
  onClose: () => void;
}

export const CreateMemoryModal: React.FC<Props> = ({ agent, onSubmit, onClose }) => {
  const [kind, setKind] = useState('insight');
  const [content, setContent] = useState('');
  const [confidence, setConfidence] = useState(0.7);
  const [tagsStr, setTagsStr] = useState('');

  const canSubmit = content.trim().length > 0;

  return (
    <Modal title="写入记忆" onClose={onClose} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.s16 }}>
        {/* Target agent (read-only) */}
        <div>
          <label style={fieldLabel}>目标智能体</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: T.s8, padding: `${T.s8}px ${T.s12}px`, borderRadius: T.r8, backgroundColor: T.bg2 }}>
            <AgentAvatar id={agent.id} name={agent.name} size={28} />
            <span style={{ fontSize: T.fs13, fontWeight: T.w6, color: T.t1, fontFamily: T.sans }}>{agent.name}</span>
            <span style={{ fontSize: T.fs11, color: T.t3, fontFamily: T.mono }}>{agent.id}</span>
          </div>
        </div>

        {/* Kind */}
        <div>
          <label style={fieldLabel}>记忆类型 *</label>
          <select value={kind} onChange={e => setKind(e.target.value)} style={fieldSelect}>
            {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>

        {/* Content */}
        <div>
          <label style={fieldLabel}>内容 *</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} placeholder="记忆内容..."
            style={{ ...fieldInput, resize: 'vertical' as const, fontFamily: T.sans }}
            onFocus={e => e.currentTarget.style.borderColor = T.pri} onBlur={e => e.currentTarget.style.borderColor = T.b2} />
        </div>

        {/* Confidence */}
        <div>
          <label style={fieldLabel}>置信度: {confidence.toFixed(2)}</label>
          <input type="range" min={0.5} max={1} step={0.05} value={confidence} onChange={e => setConfidence(+e.target.value)}
            style={{ width: '100%', accentColor: T.pri }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: T.fs11, color: T.t4, fontFamily: T.mono }}>
            <span>0.50</span><span>1.00</span>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label style={fieldLabel}>标签（逗号分隔，可选）</label>
          <input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="例：策略, 内容, 周报"
            style={fieldInput} onFocus={e => e.currentTarget.style.borderColor = T.pri} onBlur={e => e.currentTarget.style.borderColor = T.b2} />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: T.s10 }}>
          <button onClick={onClose} style={btnSecondary}>取消</button>
          <button disabled={!canSubmit} onClick={() => {
            const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
            onSubmit(content.trim(), kind, confidence, tags);
            onClose();
          }} style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.5 }}>保存</button>
        </div>
      </div>
    </Modal>
  );
};
