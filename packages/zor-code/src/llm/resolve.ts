import { PROVIDERS, ProviderConfig, ModelInfo, getAvailableProviders, getAllProviders } from './providers';
import { resolveKey } from './keys';
import { checkOllamaRunning, listOllamaModels, ollamaModelsToModelInfo } from './ollama';
import { ZorConfig } from '../config';

export interface ResolvedModel {
  provider: ProviderConfig;
  model: ModelInfo;
  apiKey: string;
}

const PROVIDER_ALIASES: Record<string, string> = {
  sonnet: 'anthropic/claude-sonnet-4-20250514',
  opus: 'anthropic/claude-opus-4-20250514',
  haiku: 'anthropic/claude-haiku-3-20240307',
  gpt5: 'openai/gpt-5',
  gpt5mini: 'openai/gpt-5-mini',
  o3: 'openai/o3',
  o4: 'openai/o4-mini',
  sonnet4: 'opencode/claude-sonnet-4',
  flash: 'google/gemini-2.5-flash',
  pro: 'google/gemini-2.5-pro',
  nemotron: 'nvidia/nemotron-3-super-120b-a12b',
  grok: 'xai/grok-3',
  codestral: 'mistral/codestral-latest',
  mistral: 'mistral/mistral-large-latest',
  deepseek: 'deepseek/deepseek-v4-pro',
  ds: 'deepseek/deepseek-v4-pro',
};

export async function resolveModel(config: ZorConfig): Promise<ResolvedModel> {
  let target = config.model;

  if (target.split('/').length === 1 && PROVIDER_ALIASES[target.toLowerCase()]) {
    target = PROVIDER_ALIASES[target.toLowerCase()];
  }

  const parts = target.split('/');
  let providerId = parts.length > 1 ? parts[0] : '';
  let modelId = parts.length > 1 ? parts.slice(1).join('/') : target;

  if (providerId) {
    const provider = getAllProviders().find(p => p.id === providerId);
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);

    if (provider.api === 'ollama') {
      if (!(await checkOllamaRunning())) throw new Error('Ollama is not running. Start it with: ollama serve');
      const models = await listOllamaModels();
      const matched = models.find(m => m.name === modelId);
      if (!matched) throw new Error(`Ollama model not found: ${modelId}. Run: ollama pull ${modelId}`);
      return {
        provider,
        model: ollamaModelsToModelInfo([matched])[0],
        apiKey: 'ollama',
      };
    }

    const key = resolveKey(provider);
    if (!key) throw new Error(`No API key for ${provider.name}. Run: zor-code keys set ${provider.id} <your-key>`);
    // modelId may not have provider prefix, but provider.models have full IDs like "nvidia/nemotron-3-ultra-550b-a55b"
    const model = provider.models.find(m => m.id === modelId || m.id === `${providerId}/${modelId}`);
    if (!model) {
      const fuzzy = provider.models.filter(m => 
        m.id.toLowerCase().includes(modelId.toLowerCase()) || 
        modelId.toLowerCase().includes(m.id.replace(`${providerId}/`, '').toLowerCase())
      );
      if (fuzzy.length > 0) {
        const suggestions = fuzzy.map(m => `  ${m.id}`).join('\n');
        throw new Error(`Model ${modelId} not in ${provider.name}. Did you mean?\n${suggestions}`);
      }
      throw new Error(`Model ${modelId} not found in ${provider.name}`);
    }
    return { provider, model, apiKey: key };
  }

  // No provider prefix — match model across all providers
  for (const provider of getAllProviders()) {
    if (provider.api === 'ollama') continue;
    // Model IDs in provider.models already include provider prefix (e.g., "nvidia/nemotron-3-ultra-550b-a55b")
    const model = provider.models.find(m => m.id === modelId || m.id.endsWith(`/${modelId}`));
    if (model) {
      const key = resolveKey(provider);
      if (!key) throw new Error(`Found ${modelId} in ${provider.name} but no API key. Run: zor-code keys set ${provider.id} <your-key>`);
      return { provider, model, apiKey: key };
    }
  }

  throw new Error(`Model not found: ${target}. Use: provider/model (e.g., anthropic/claude-sonnet-4-20250514)`);
}

export async function listAllModels(): Promise<(ModelInfo & { providerId: string; providerName: string })[]> {
  const result: (ModelInfo & { providerId: string; providerName: string })[] = [];

  for (const provider of getAllProviders()) {
    if (provider.api === 'ollama') {
      if (await checkOllamaRunning()) {
        const models = await listOllamaModels();
        result.push(...ollamaModelsToModelInfo(models).map(m => ({
          ...m,
          providerId: 'ollama',
          providerName: 'Ollama (Local)',
        })));
      }
      continue;
    }

    if (resolveKey(provider)) {
      result.push(...provider.models.map(m => ({
        ...m,
        providerId: provider.id,
        providerName: provider.name,
      })));
    }
  }

  return result;
}