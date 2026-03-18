import React, { useState } from 'react';
import { T } from './styles';
import { Modal, fieldLabel, fieldInput, fieldSelect, btnPrimary, btnSecondary } from './Modal';
import { Eye, EyeOff, Loader } from 'lucide-react';
import type { LlmModelConfig, LlmModelConfigInput } from '../types';

// ─── Preset data ───

interface ProviderPreset {
  id: string;
  label: string;
  models: string[];
  defaultBaseUrl: string;
}

const PROVIDERS: ProviderPreset[] = [
  {
    id: 'anthropic', label: 'Anthropic (Claude)',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-5-20251001'],
    defaultBaseUrl: '',
  },
  {
    id: 'openai', label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3-mini'],
    defaultBaseUrl: '',
  },
  {
    id: 'deepseek', label: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultBaseUrl: 'https://api.deepseek.com',
  },
  {
    id: 'google', label: 'Google (Gemini)',
    models: ['gemini-2.5-pro-preview-05-06', 'gemini-2.5-flash-preview-04-17', 'gemini-2.0-flash'],
    defaultBaseUrl: '',
  },
  {
    id: 'zhipu', label: '智谱 (GLM)',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  },
  {
    id: 'moonshot', label: 'Moonshot (Kimi)',
    models: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
  },
];

const IMAGE_PROVIDERS: ProviderPreset[] = [
  {
    id: 'openai', label: 'OpenAI',
    models: ['gpt-image-1', 'dall-e-3'],
    defaultBaseUrl: '',
  },
];

const CUSTOM_VALUE = '__custom__';

// ─── Component ───

interface Props {
  initial?: LlmModelConfig | null;
  onSave: (data: LlmModelConfigInput) => Promise<void>;
  onClose: () => void;
}

export const ModelConfigModal: React.FC<Props> = ({ initial, onSave, onClose }) => {
  const isEdit = !!initial;

  const [modelType, setModelType] = useState<'text' | 'image'>(initial?.type || 'text');

  const availableProviders = modelType === 'image' ? IMAGE_PROVIDERS : PROVIDERS;

  // 判断初始值是否匹配预设
  const initPreset = availableProviders.find(p => p.id === initial?.provider);
  const initModelInPreset = initPreset?.models.includes(initial?.model || '');

  const [providerKey, setProviderKey] = useState(initPreset ? initPreset.id : (initial?.provider ? CUSTOM_VALUE : ''));
  const [customProvider, setCustomProvider] = useState(initPreset ? '' : (initial?.provider || ''));
  const [modelKey, setModelKey] = useState(initModelInPreset ? (initial?.model || '') : (initial?.model ? CUSTOM_VALUE : ''));
  const [customModel, setCustomModel] = useState(initModelInPreset ? '' : (initial?.model || ''));
  const [name, setName] = useState(initial?.name || '');
  const [apiKey, setApiKey] = useState(initial?.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl || '');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentPreset = availableProviders.find(p => p.id === providerKey);
  const effectiveProvider = providerKey === CUSTOM_VALUE ? customProvider.trim() : (currentPreset?.id || '');
  const effectiveModel = modelKey === CUSTOM_VALUE ? customModel.trim() : modelKey;

  const canSave = effectiveProvider && effectiveModel;

  const handleProviderChange = (key: string) => {
    setProviderKey(key);
    if (key !== CUSTOM_VALUE) {
      setCustomProvider('');
      const preset = availableProviders.find(p => p.id === key);
      if (preset) {
        // 自动选中第一个模型
        setModelKey(preset.models[0] || '');
        setCustomModel('');
        // 自动填充默认 baseUrl（仅当当前为空或等于其他 preset 的默认值时）
        const otherDefaults = availableProviders.map(p => p.defaultBaseUrl).filter(Boolean);
        if (!baseUrl || otherDefaults.includes(baseUrl)) {
          setBaseUrl(preset.defaultBaseUrl);
        }
      }
    } else {
      setModelKey('');
      setCustomModel('');
    }
  };

  const handleModelChange = (key: string) => {
    setModelKey(key);
    if (key !== CUSTOM_VALUE) setCustomModel('');
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const data: LlmModelConfigInput = {
        name: name.trim() || `${effectiveProvider} / ${effectiveModel}`,
        provider: effectiveProvider,
        model: effectiveModel,
        baseUrl: baseUrl.trim(),
        type: modelType,
      };
      if (apiKey && !apiKey.includes('****')) {
        data.apiKey = apiKey;
      }
      await onSave(data);
      onClose();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <Modal title={isEdit ? '编辑模型配置' : '新增模型配置'} onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.s16 }}>
        {/* Type */}
        <div>
          <label style={fieldLabel}>类型</label>
          <select style={fieldSelect} value={modelType} onChange={e => {
            const t = e.target.value as 'text' | 'image';
            setModelType(t);
            // 切换类型时重置 provider/model
            const providers = t === 'image' ? IMAGE_PROVIDERS : PROVIDERS;
            if (providers.length > 0) {
              setProviderKey(providers[0].id);
              setModelKey(providers[0].models[0] || '');
              setBaseUrl(providers[0].defaultBaseUrl);
            } else {
              setProviderKey('');
              setModelKey('');
            }
            setCustomProvider('');
            setCustomModel('');
          }} disabled={isEdit}>
            <option value="text">文本生成</option>
            <option value="image">图片生成</option>
          </select>
        </div>

        {/* Name */}
        <div>
          <label style={fieldLabel}>
            配置名称
            <span style={{ fontWeight: T.w4, color: T.t4, marginLeft: 6 }}>（可选，方便辨识）</span>
          </label>
          <input style={fieldInput} value={name} onChange={e => setName(e.target.value)} placeholder="如：生产环境 Claude" />
        </div>

        {/* Provider */}
        <div>
          <label style={fieldLabel}>模型提供商 *</label>
          <select style={fieldSelect} value={providerKey} onChange={e => handleProviderChange(e.target.value)}>
            <option value="" disabled>请选择提供商</option>
            {availableProviders.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            <option value={CUSTOM_VALUE}>其他（自定义）</option>
          </select>
          {providerKey === CUSTOM_VALUE && (
            <input style={{ ...fieldInput, marginTop: T.s8 }} value={customProvider}
              onChange={e => setCustomProvider(e.target.value)} placeholder="输入提供商标识，如 siliconflow" />
          )}
        </div>

        {/* Model */}
        <div>
          <label style={fieldLabel}>模型名称 *</label>
          {currentPreset && currentPreset.models.length > 0 ? (
            <>
              <select style={fieldSelect} value={modelKey} onChange={e => handleModelChange(e.target.value)}>
                {currentPreset.models.map(m => <option key={m} value={m}>{m}</option>)}
                <option value={CUSTOM_VALUE}>自定义模型</option>
              </select>
              {modelKey === CUSTOM_VALUE && (
                <input style={{ ...fieldInput, marginTop: T.s8, fontFamily: T.mono }}
                  value={customModel} onChange={e => setCustomModel(e.target.value)}
                  placeholder="输入模型名称" />
              )}
            </>
          ) : (
            <input style={{ ...fieldInput, fontFamily: T.mono }} value={customModel}
              onChange={e => { setCustomModel(e.target.value); setModelKey(CUSTOM_VALUE); }}
              placeholder="输入模型名称" />
          )}
        </div>

        {/* API Key */}
        <div>
          <label style={fieldLabel}>
            API Key *
            {isEdit && initial?.hasKey && <span style={{ color: T.green, marginLeft: 8, fontWeight: T.w4 }}>已配置</span>}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              style={{ ...fieldInput, paddingRight: 40, fontFamily: T.mono, fontSize: T.fs13 }}
              type={showKey ? 'text' : 'password'}
              value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
            <button
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.t4, padding: 4 }}
              onClick={() => setShowKey(!showKey)} tabIndex={-1}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Base URL */}
        <div>
          <label style={fieldLabel}>
            Base URL
            <span style={{ fontWeight: T.w4, color: T.t4, marginLeft: 6 }}>（可选，留空使用官方默认）</span>
          </label>
          <input
            style={{ ...fieldInput, fontFamily: T.mono, fontSize: T.fs13 }}
            value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
            placeholder={currentPreset?.defaultBaseUrl || 'https://api.example.com/v1'}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: T.s12, justifyContent: 'flex-end', marginTop: T.s8 }}>
          <button style={btnSecondary} onClick={onClose}>取消</button>
          <button
            style={{ ...btnPrimary, opacity: canSave && !saving ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={handleSave} disabled={!canSave || saving}
          >
            {saving && <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {isEdit ? '保存' : '添加'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
