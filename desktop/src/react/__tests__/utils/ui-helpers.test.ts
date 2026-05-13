import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hanaFetch } from '../../hooks/use-hana-fetch';
import { loadModels } from '../../utils/ui-helpers';

const mockState: Record<string, any> = {};

vi.mock('../../stores', () => ({
  useStore: {
    getState: () => mockState,
    setState: (patch: Record<string, any> | ((s: Record<string, any>) => Record<string, any>)) => {
      const next = typeof patch === 'function' ? patch(mockState) : patch;
      Object.assign(mockState, next);
    },
  },
}));

vi.mock('../../hooks/use-hana-fetch', () => ({
  hanaFetch: vi.fn(),
}));

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as unknown as Response;
}

describe('loadModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockState)) delete mockState[key];
    mockState.pendingNewSession = true;
  });

  it('uses activeModel as the current model fallback on a pending new session', async () => {
    vi.mocked(hanaFetch).mockResolvedValueOnce(jsonResponse({
      models: [
        { id: 'deepseek-v4-flash', provider: 'deepseek', name: 'DeepSeek V4 Flash', isCurrent: false },
        { id: 'mimo-v2-omni', provider: 'mimo', name: 'MiMo V2 Omni', isCurrent: false },
      ],
      current: null,
      activeModel: { id: 'deepseek-v4-flash', provider: 'deepseek' },
    }));

    await loadModels();

    expect(mockState.models[0].isCurrent).toBe(true);
    expect(mockState.models[1].isCurrent).toBe(false);
    expect(mockState.currentModel).toEqual({ id: 'deepseek-v4-flash', provider: 'deepseek' });
  });

  it('keeps an explicit no-current state when neither current nor active model exists', async () => {
    vi.mocked(hanaFetch).mockResolvedValueOnce(jsonResponse({
      models: [
        { id: 'deepseek-v4-flash', provider: 'deepseek', name: 'DeepSeek V4 Flash', isCurrent: false },
      ],
      current: null,
      activeModel: null,
    }));

    await loadModels();

    expect(mockState.models[0].isCurrent).toBe(false);
    expect(mockState.currentModel).toBeNull();
  });
});
