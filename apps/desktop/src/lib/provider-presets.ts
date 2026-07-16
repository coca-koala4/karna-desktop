export interface ProviderPreset {
  id: string
  label: string
  protocol: 'openai_chat' | 'anthropic_messages'
  keyEnv: string
  baseUrlOptions: Array<{
    id: string
    label: string
    baseUrl: string
  }>
  supportsModelDiscovery: boolean
  requiresManualModelId: boolean
  documentationUrl?: string
  recommendedModels?: string[]
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'siliconflow',
    label: '硅基流动 (SiliconFlow)',
    protocol: 'openai_chat',
    keyEnv: 'SILICONFLOW_API_KEY',
    baseUrlOptions: [
      {
        id: 'default',
        label: '默认',
        baseUrl: 'https://api.siliconflow.cn/v1'
      }
    ],
    supportsModelDiscovery: true,
    requiresManualModelId: false,
    documentationUrl: 'https://docs.siliconflow.cn/',
    recommendedModels: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3', 'meta-llama/Llama-3.1-70B-Instruct']
  },
  {
    id: 'doubao',
    label: '火山引擎方舟/豆包 (Doubao/Ark)',
    protocol: 'openai_chat',
    keyEnv: 'ARK_API_KEY',
    baseUrlOptions: [
      {
        id: 'beijing',
        label: '北京区域',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3'
      }
    ],
    supportsModelDiscovery: false,
    requiresManualModelId: true,
    documentationUrl: 'https://www.volcengine.com/docs/82379'
  },
  {
    id: 'qianfan',
    label: '百度千帆 ModelBuilder V2 (Qianfan)',
    protocol: 'openai_chat',
    keyEnv: 'QIANFAN_API_KEY',
    baseUrlOptions: [
      {
        id: 'default',
        label: '默认',
        baseUrl: 'https://qianfan.baidubce.com/v2'
      }
    ],
    supportsModelDiscovery: false,
    requiresManualModelId: true,
    documentationUrl: 'https://cloud.baidu.com/doc/WENXINWORKSHOP/index.html'
  },
  {
    id: 'ollama-local',
    label: '本地 Ollama (Ollama Local)',
    protocol: 'openai_chat',
    keyEnv: 'OLLAMA_API_KEY',
    baseUrlOptions: [
      {
        id: 'default',
        label: '本地默认',
        baseUrl: 'http://127.0.0.1:11434/v1'
      }
    ],
    supportsModelDiscovery: true,
    requiresManualModelId: false,
    documentationUrl: 'https://ollama.com/',
    recommendedModels: ['llama3.1', 'qwen2.5', 'deepseek-r1']
  },
  {
    id: 'custom-openai',
    label: '自定义 OpenAI 兼容平台 (Custom OpenAI-compatible)',
    protocol: 'openai_chat',
    keyEnv: 'CUSTOM_OPENAI_API_KEY',
    baseUrlOptions: [],
    supportsModelDiscovery: false,
    requiresManualModelId: true
  }
]

export function findProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(preset => preset.id === id)
}
