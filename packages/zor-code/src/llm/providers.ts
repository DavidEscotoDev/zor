export interface ProviderConfig {
  id: string;
  name: string;
  api: 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom';
  baseUrl: string;
  envKey: string;
  models: ModelInfo[];
  source?: 'built-in' | 'custom';
  _custom?: boolean;
  _customProvider?: any;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  supportsThinking: boolean;
  supportsVision: boolean;
  pricing: { input: number; output: number };
}

export const PROVIDERS: ProviderConfig[] = [
  // ── Anthropic ──
  {
    id: 'anthropic',
    name: 'Anthropic',
    api: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    envKey: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 15, output: 75 } },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 3, output: 15 } },
    ],
    source: 'built-in',
  },

  // ── OpenCode Go (proxy with Anthropic/OpenAI/DeepSeek/Google/etc models) ──
  {
    id: 'opencode',
    name: 'OpenCode Go',
    api: 'custom',
    baseUrl: 'https://opencode.ai/zen',
    envKey: 'OPENCODE_API_KEY',
    models: [
      { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 3, output: 15 } },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 3, output: 15 } },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 3, output: 15 } },
      { id: 'claude-opus-4-1', name: 'Claude Opus 4.1', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 15, output: 75 } },
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 15, output: 75 } },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 15, output: 75 } },
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 15, output: 75 } },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 15, output: 75 } },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 0.25, output: 1.25 } },
      { id: 'big-pickle', name: 'Big Pickle (Stealth)', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'gpt-5', name: 'GPT-5', contextWindow: 128000, maxTokens: 16384, supportsThinking: false, supportsVision: true, pricing: { input: 10, output: 30 } },
      { id: 'gpt-5.4', name: 'GPT-5.4', contextWindow: 128000, maxTokens: 16384, supportsThinking: false, supportsVision: true, pricing: { input: 10, output: 30 } },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 64000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0.27, output: 1.1 } },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextWindow: 64000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0.55, output: 2.19 } },
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash', contextWindow: 1000000, maxTokens: 65536, supportsThinking: true, supportsVision: true, pricing: { input: 0.15, output: 0.6 } },
      { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', contextWindow: 1000000, maxTokens: 65536, supportsThinking: true, supportsVision: true, pricing: { input: 1.25, output: 10 } },
      { id: 'glm-5', name: 'GLM 5', contextWindow: 128000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'kimi-k2.5', name: 'Kimi K2.5', contextWindow: 128000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'qwen3.5-plus', name: 'Qwen3.5 Plus', contextWindow: 128000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'grok-build-0.1', name: 'Grok Build 0.1', contextWindow: 128000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'minimax-m2.5', name: 'MiniMax M2.5', contextWindow: 128000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'mimo-v2.5-free', name: 'MiMo V2.5 Free', contextWindow: 128000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra Free', contextWindow: 128000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'north-mini-code-free', name: 'North Mini Code Free', contextWindow: 128000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
    ],
  },

  // ── OpenAI ──
  {
    id: 'openai',
    name: 'OpenAI',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-5', name: 'GPT-5', contextWindow: 128000, maxTokens: 16384, supportsThinking: false, supportsVision: true, pricing: { input: 10, output: 30 } },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', contextWindow: 128000, maxTokens: 16384, supportsThinking: false, supportsVision: true, pricing: { input: 1.5, output: 6 } },
      { id: 'o3', name: 'o3', contextWindow: 200000, maxTokens: 100000, supportsThinking: true, supportsVision: true, pricing: { input: 10, output: 40 } },
      { id: 'o4-mini', name: 'o4-mini', contextWindow: 200000, maxTokens: 100000, supportsThinking: true, supportsVision: true, pricing: { input: 1.1, output: 4.4 } },
    ],
  },

  // ── Google ──
  {
    id: 'google',
    name: 'Google Gemini',
    api: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    envKey: 'GOOGLE_API_KEY',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1000000, maxTokens: 65536, supportsThinking: true, supportsVision: true, pricing: { input: 1.25, output: 10 } },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1000000, maxTokens: 65536, supportsThinking: true, supportsVision: true, pricing: { input: 0.15, output: 0.6 } },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1000000, maxTokens: 8192, supportsThinking: false, supportsVision: true, pricing: { input: 0.1, output: 0.4 } },
    ],
  },

  // ── DeepSeek ──
  {
    id: 'deepseek',
    name: 'DeepSeek',
    api: 'openai',
    baseUrl: 'https://api.deepseek.com',
    envKey: 'DEEPSEEK_API_KEY',
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 64000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0.27, output: 1.1 } },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextWindow: 64000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0.55, output: 2.19 } },
    ],
  },

  // ── OpenRouter (meta-provider: all OpenAI-compatible) ──
  {
    id: 'openrouter',
    name: 'OpenRouter',
    api: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (via OpenRouter)', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 3, output: 15 } },
      { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', contextWindow: 100000, maxTokens: 32000, supportsThinking: false, supportsVision: true, pricing: { input: 0.2, output: 0.6 } },
      { id: 'qwen/qwen3-235b-a22b', name: 'Qwen3 235B', contextWindow: 131072, maxTokens: 32768, supportsThinking: true, supportsVision: false, pricing: { input: 0.2, output: 0.6 } },
      { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextWindow: 64000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0.55, output: 2.19 } },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1000000, maxTokens: 65536, supportsThinking: true, supportsVision: true, pricing: { input: 1.25, output: 10 } },
    ],
  },

  // ── Groq ──
  {
    id: 'groq',
    name: 'Groq',
    api: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', contextWindow: 128000, maxTokens: 32768, supportsThinking: false, supportsVision: false, pricing: { input: 0.59, output: 0.79 } },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', contextWindow: 128000, maxTokens: 8192, supportsThinking: false, supportsVision: false, pricing: { input: 0.05, output: 0.08 } },
      { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', contextWindow: 128000, maxTokens: 16384, supportsThinking: true, supportsVision: false, pricing: { input: 0.29, output: 0.39 } },
    ],
  },

  // ── Mistral ──
  {
    id: 'mistral',
    name: 'Mistral',
    api: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    envKey: 'MISTRAL_API_KEY',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', contextWindow: 128000, maxTokens: 32768, supportsThinking: false, supportsVision: true, pricing: { input: 2, output: 6 } },
      { id: 'codestral-latest', name: 'Codestral', contextWindow: 256000, maxTokens: 32768, supportsThinking: false, supportsVision: false, pricing: { input: 0.3, output: 0.9 } },
    ],
  },

  // ── xAI ──
  {
    id: 'xai',
    name: 'xAI (Grok)',
    api: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    envKey: 'XAI_API_KEY',
    models: [
      { id: 'grok-3', name: 'Grok 3', contextWindow: 131072, maxTokens: 131072, supportsThinking: true, supportsVision: true, pricing: { input: 3, output: 15 } },
      { id: 'grok-3-fast', name: 'Grok 3 Fast', contextWindow: 131072, maxTokens: 131072, supportsThinking: true, supportsVision: true, pricing: { input: 5, output: 25 } },
      { id: 'grok-build-0.1', name: 'Grok Build 0.1', contextWindow: 131072, maxTokens: 131072, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
    ],
  },

  // ── Together ──
  {
    id: 'together',
    name: 'Together AI',
    api: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    envKey: 'TOGETHER_API_KEY',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B', contextWindow: 128000, maxTokens: 32768, supportsThinking: false, supportsVision: false, pricing: { input: 0.88, output: 0.88 } },
      { id: 'deepseek-ai/DeepSeek-V4-Pro', name: 'DeepSeek V4 Pro', contextWindow: 64000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0.55, output: 2.19 } },
      { id: 'Qwen/Qwen3.6-Plus', name: 'Qwen3.6 Plus', contextWindow: 128000, maxTokens: 16384, supportsThinking: true, supportsVision: false, pricing: { input: 0.6, output: 2.4 } },
    ],
  },

  // ── Perplexity (OpenAI-compatible, not in pi-ai) ──
  {
    id: 'perplexity',
    name: 'Perplexity',
    api: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    envKey: 'PERPLEXITY_API_KEY',
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro', contextWindow: 200000, maxTokens: 8192, supportsThinking: false, supportsVision: false, pricing: { input: 3, output: 15 } },
    ],
  },

  // ── Cohere (OpenAI-compatible, not in pi-ai) ──
  {
    id: 'cohere',
    name: 'Cohere',
    api: 'openai',
    baseUrl: 'https://api.cohere.com/v2',
    envKey: 'COHERE_API_KEY',
    models: [
      { id: 'command-r-plus', name: 'Command R+', contextWindow: 128000, maxTokens: 4096, supportsThinking: false, supportsVision: false, pricing: { input: 2.5, output: 10 } },
    ],
  },

  // ── Cerebras ──
  {
    id: 'cerebras',
    name: 'Cerebras',
    api: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    envKey: 'CEREBRAS_API_KEY',
    models: [
      { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', contextWindow: 128000, maxTokens: 32768, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
    ],
  },

  // ── Novita (OpenAI-compatible, not in pi-ai) ──
  {
    id: 'novita',
    name: 'Novita AI',
    api: 'openai',
    baseUrl: 'https://api.novita.ai/v3/openai',
    envKey: 'NOVITA_API_KEY',
    models: [
      { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', contextWindow: 128000, maxTokens: 8192, supportsThinking: false, supportsVision: false, pricing: { input: 0.35, output: 0.4 } },
    ],
  },

// ── NVIDIA NIM ──
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    api: 'openai',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    envKey: 'NVIDIA_API_KEY',
    models: [
      { id: 'nvidia/nemotron-3-ultra-550b-a55b', name: 'Nemotron 3 Ultra 550B', contextWindow: 128000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'nvidia/nemotron-3-super-120b-a12b', name: 'Nemotron 3 Super 120B', contextWindow: 128000, maxTokens: 32768, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'nvidia/nemotron-3-nano-30b-a3b', name: 'Nemotron 3 Nano 30B (fast)', contextWindow: 128000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'nvidia/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', contextWindow: 128000, maxTokens: 32768, supportsThinking: false, supportsVision: false, pricing: { input: 0.36, output: 0.36 } },
    ],
  },

  // ── Fireworks ──
  {
    id: 'fireworks',
    name: 'Fireworks',
    api: 'openai',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    envKey: 'FIREWORKS_API_KEY',
    models: [
      { id: 'accounts/fireworks/models/deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 64000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'accounts/fireworks/models/deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextWindow: 64000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
    ],
  },

  // ── DeepInfra (OpenAI-compatible, not in pi-ai) ──
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    api: 'openai',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    envKey: 'DEEPINFRA_API_KEY',
    models: [
      { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B', contextWindow: 128000, maxTokens: 8192, supportsThinking: false, supportsVision: false, pricing: { input: 0.35, output: 0.35 } },
    ],
  },

  // ── MiniMax ──
  {
    id: 'minimax',
    name: 'MiniMax',
    api: 'openai',
    baseUrl: 'https://api.minimax.chat/v1',
    envKey: 'MINIMAX_API_KEY',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', contextWindow: 128000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'MiniMax-M3', name: 'MiniMax M3', contextWindow: 128000, maxTokens: 8192, supportsThinking: true, supportsVision: false, pricing: { input: 0, output: 0 } },
    ],
  },

  // ── Ollama (local) ──
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    api: 'ollama',
    baseUrl: 'http://localhost:11434',
    envKey: '',
    models: [], // dynamically populated
  },

  // ── Moonshot AI (Kimi) ──
  {
    id: 'moonshotai',
    name: 'Moonshot AI',
    api: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    envKey: 'MOONSHOT_API_KEY',
    models: [
      { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', contextWindow: 8000, maxTokens: 4096, supportsThinking: false, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', contextWindow: 32768, maxTokens: 4096, supportsThinking: false, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', contextWindow: 131072, maxTokens: 4096, supportsThinking: false, supportsVision: false, pricing: { input: 0, output: 0 } },
    ],
  },

  // ── Hugging Face ──
  {
    id: 'huggingface',
    name: 'Hugging Face',
    api: 'openai',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    envKey: 'HUGGINGFACE_API_KEY',
    models: [
      { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B', contextWindow: 128000, maxTokens: 8192, supportsThinking: false, supportsVision: false, pricing: { input: 0, output: 0 } },
      { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen2.5 Coder 32B', contextWindow: 131072, maxTokens: 8192, supportsThinking: false, supportsVision: false, pricing: { input: 0, output: 0 } },
    ],
  },

  // ── Zhipu AI (GLM) ──
  {
    id: 'zai',
    name: 'Zhipu AI',
    api: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    envKey: 'ZAI_API_KEY',
    models: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus', contextWindow: 128000, maxTokens: 4096, supportsThinking: true, supportsVision: true, pricing: { input: 0, output: 0 } },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', contextWindow: 128000, maxTokens: 4096, supportsThinking: false, supportsVision: false, pricing: { input: 0, output: 0 } },
    ],
  },

  // ── Cloudflare Workers AI ──
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    api: 'openai',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1',
    envKey: 'CLOUDFLARE_API_KEY',
    models: [
      { id: '@cf/meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (CF)', contextWindow: 128000, maxTokens: 8192, supportsThinking: false, supportsVision: false, pricing: { input: 0, output: 0 } },
    ],
  },

  // ── GitHub Copilot ──
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    api: 'openai',
    baseUrl: 'https://api.githubcopilot.com',
    envKey: 'GITHUB_COPILOT_TOKEN',
    models: [
      { id: 'claude-sonnet-4', name: 'Claude Sonnet 4 (Copilot)', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 0, output: 0 } },
      { id: 'gpt-5', name: 'GPT-5 (Copilot)', contextWindow: 128000, maxTokens: 8192, supportsThinking: false, supportsVision: true, pricing: { input: 0, output: 0 } },
    ],
  },

  // ── Amazon Bedrock ──
  {
    id: 'amazon-bedrock',
    name: 'Amazon Bedrock',
    api: 'custom',
    baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    envKey: 'AWS_ACCESS_KEY_ID',
    models: [
      { id: 'anthropic.claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (Bedrock)', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 3, output: 15 } },
    ],
  },

  // ── Azure OpenAI ──
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    api: 'openai',
    baseUrl: 'https://{resource}.openai.azure.com/openai/v1',
    envKey: 'AZURE_OPENAI_API_KEY',
    models: [
      { id: 'gpt-5', name: 'GPT-5 (Azure)', contextWindow: 128000, maxTokens: 8192, supportsThinking: false, supportsVision: true, pricing: { input: 10, output: 30 } },
    ],
  },

  // ── Google Vertex AI ──
  {
    id: 'google-vertex',
    name: 'Google Vertex AI',
    api: 'google',
    baseUrl: 'https://{region}-aiplatform.googleapis.com/v1',
    envKey: 'GOOGLE_APPLICATION_CREDENTIALS',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Vertex)', contextWindow: 1000000, maxTokens: 65536, supportsThinking: true, supportsVision: true, pricing: { input: 1.25, output: 10 } },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Vertex)', contextWindow: 1000000, maxTokens: 65536, supportsThinking: true, supportsVision: true, pricing: { input: 0.15, output: 0.6 } },
    ],
  },
];

import { loadCustomProviders, mergeCustomProviders } from './custom-providers';

export function getProvider(id: string): ProviderConfig | undefined {
  return getAllProviders().find(p => p.id === id);
}

export function resolveApiKey(provider: ProviderConfig): string | null {
  if (provider.api === 'ollama') return 'ollama';
  return process.env[provider.envKey] || null;
}

export function getAvailableProviders(): ProviderConfig[] {
  return getAllProviders().filter(p => {
    if (p.api === 'ollama') return true;
    return !!process.env[p.envKey];
  });
}

export function getAllProviders(): ProviderConfig[] {
  // Lazy-load custom providers
  let custom: any[] = [];
  try {
    custom = loadCustomProviders('~/.zor/models.json');
  } catch {}
  return mergeCustomProviders(PROVIDERS, custom);
}