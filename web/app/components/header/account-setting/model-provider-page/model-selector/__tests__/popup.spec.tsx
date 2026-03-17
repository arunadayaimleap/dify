import type { Model, ModelItem, ModelProvider } from '../../declarations'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  ConfigurationMethodEnum,
  ModelFeatureEnum,
  ModelStatusEnum,
  ModelTypeEnum,
} from '../../declarations'
import Popup from '../popup'

let mockLanguage = 'en_US'

const mockSetShowAccountSettingModal = vi.hoisted(() => vi.fn())
vi.mock('@/context/modal-context', () => ({
  useModalContext: () => ({
    setShowAccountSettingModal: mockSetShowAccountSettingModal,
  }),
}))

const mockSupportFunctionCall = vi.hoisted(() => vi.fn())
vi.mock('@/utils/tool-call', () => ({
  supportFunctionCall: mockSupportFunctionCall,
}))

type MockMarketplacePlugin = {
  plugin_id: string
  latest_package_identifier: string
}

type MockContextProvider = Pick<ModelProvider, 'provider' | 'label' | 'icon_small' | 'icon_small_dark' | 'custom_configuration' | 'system_configuration'>

const mockMarketplacePlugins = vi.hoisted(() => ({
  current: [] as MockMarketplacePlugin[],
  isLoading: false,
}))
const mockContextModelProviders = vi.hoisted(() => ({
  current: [] as MockContextProvider[],
}))
const mockTrialModels = vi.hoisted(() => ({
  current: ['test-openai', 'test-anthropic'] as string[],
}))
vi.mock('../../hooks', async () => {
  const actual = await vi.importActual<typeof import('../../hooks')>('../../hooks')
  return {
    ...actual,
    useLanguage: () => mockLanguage,
  }
})

vi.mock('../popup-item', () => ({
  default: ({ model }: { model: Model }) => <div>{model.provider}</div>,
}))

vi.mock('@/context/provider-context', () => ({
  useProviderContext: () => ({ modelProviders: mockContextModelProviders.current }),
}))

vi.mock('@/context/global-public-context', () => ({
  useSystemFeaturesQuery: () => ({
    data: { trial_models: mockTrialModels.current },
  }),
}))

const mockTrialCredits = vi.hoisted(() => ({
  credits: 200,
  totalCredits: 200,
  isExhausted: false,
  isLoading: false,
  nextCreditResetDate: undefined as number | undefined,
}))
vi.mock('../../provider-added-card/use-trial-credits', () => ({
  useTrialCredits: () => mockTrialCredits,
}))

vi.mock('../../provider-added-card/model-auth-dropdown/credits-exhausted-alert', () => ({
  default: ({ hasApiKeyFallback }: { hasApiKeyFallback: boolean }) => (
    <div data-testid="credits-exhausted-alert" data-has-api-key-fallback={String(hasApiKeyFallback)} />
  ),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light' }),
}))

vi.mock('@/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config')>()
  return { ...actual, IS_CLOUD_EDITION: true }
})

const mockInstallMutateAsync = vi.hoisted(() => vi.fn())
vi.mock('@/service/use-plugins', () => ({
  useInstallPackageFromMarketPlace: () => ({ mutateAsync: mockInstallMutateAsync }),
}))

const mockRefreshPluginList = vi.hoisted(() => vi.fn())
vi.mock('@/app/components/plugins/install-plugin/hooks/use-refresh-plugin-list', () => ({
  default: () => ({ refreshPluginList: mockRefreshPluginList }),
}))

const mockCheck = vi.hoisted(() => vi.fn())
vi.mock('@/app/components/plugins/install-plugin/base/check-task-status', () => ({
  default: () => ({ check: mockCheck }),
}))

vi.mock('@/utils/var', () => ({
  getMarketplaceUrl: vi.fn(() => 'https://marketplace.example.com'),
}))

vi.mock('../../utils', async () => {
  const actual = await vi.importActual<typeof import('../../utils')>('../../utils')
  return {
    ...actual,
    MODEL_PROVIDER_QUOTA_GET_PAID: ['test-openai', 'test-anthropic'],
    providerIconMap: {
      'test-openai': ({ className }: { className?: string }) => <span className={className}>OAI</span>,
      'test-anthropic': ({ className }: { className?: string }) => <span className={className}>ANT</span>,
    },
    modelNameMap: {
      'test-openai': 'TestOpenAI',
      'test-anthropic': 'TestAnthropic',
    },
    providerKeyToPluginId: {
      'test-openai': 'langgenius/openai',
      'test-anthropic': 'langgenius/anthropic',
    },
  }
})

const makeModelItem = (overrides: Partial<ModelItem> = {}): ModelItem => ({
  model: 'gpt-4',
  label: { en_US: 'GPT-4', zh_Hans: 'GPT-4' },
  model_type: ModelTypeEnum.textGeneration,
  fetch_from: ConfigurationMethodEnum.predefinedModel,
  status: ModelStatusEnum.active,
  model_properties: {},
  load_balancing_enabled: false,
  ...overrides,
})

const makeModel = (overrides: Partial<Model> = {}): Model => ({
  provider: 'openai',
  icon_small: { en_US: '', zh_Hans: '' },
  label: { en_US: 'OpenAI', zh_Hans: 'OpenAI' },
  models: [makeModelItem()],
  status: ModelStatusEnum.active,
  ...overrides,
})

const makeContextProvider = (overrides: Partial<MockContextProvider> = {}): MockContextProvider => ({
  provider: 'test-openai',
  label: { en_US: 'Test OpenAI', zh_Hans: 'Test OpenAI' },
  icon_small: { en_US: '', zh_Hans: '' },
  icon_small_dark: { en_US: '', zh_Hans: '' },
  custom_configuration: {
    status: 'no-configure',
  } as MockContextProvider['custom_configuration'],
  system_configuration: {
    enabled: false,
  } as MockContextProvider['system_configuration'],
  ...overrides,
})

describe('Popup', () => {
  let closeActiveTooltipSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockLanguage = 'en_US'
    mockSupportFunctionCall.mockReturnValue(true)
    closeActiveTooltipSpy = vi.spyOn(tooltipManager, 'closeActiveTooltip')
  })

  it('should filter models by search and allow clearing search', () => {
    render(
      <Popup
        modelList={[makeModel()]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    expect(screen.getByText('openai')).toBeInTheDocument()

    const input = screen.getByPlaceholderText('datasetSettings.form.searchModel')
    fireEvent.change(input, { target: { value: 'not-found' } })
    expect(screen.getByText('No model found for “not-found”')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '' } })
    expect((input as HTMLInputElement).value).toBe('')
    expect(screen.getByText('openai')).toBeInTheDocument()
  })

  it('should filter by scope features including toolCall and non-toolCall checks', () => {
    const modelList = [
      makeModel({ models: [makeModelItem({ features: [ModelFeatureEnum.toolCall, ModelFeatureEnum.vision] })] }),
    ]

    // When tool-call support is missing, it should be filtered out.
    mockSupportFunctionCall.mockReturnValue(false)
    const { unmount } = render(
      <Popup
        modelList={modelList}
        onSelect={vi.fn()}
        onHide={vi.fn()}
        scopeFeatures={[ModelFeatureEnum.toolCall, ModelFeatureEnum.vision]}
      />,
    )
    expect(screen.getByText('No model found for “”')).toBeInTheDocument()

    // When tool-call support exists, the non-toolCall feature check should also pass.
    unmount()
    mockSupportFunctionCall.mockReturnValue(true)
    const { unmount: unmount2 } = render(
      <Popup
        modelList={modelList}
        onSelect={vi.fn()}
        onHide={vi.fn()}
        scopeFeatures={[ModelFeatureEnum.toolCall, ModelFeatureEnum.vision]}
      />,
    )
    expect(screen.getByText('openai')).toBeInTheDocument()

    unmount2()
    const { unmount: unmount3 } = render(
      <Popup
        modelList={modelList}
        onSelect={vi.fn()}
        onHide={vi.fn()}
        scopeFeatures={[ModelFeatureEnum.vision]}
      />,
    )
    expect(screen.getByText('openai')).toBeInTheDocument()

    // When features are missing, non-toolCall feature checks should fail.
    unmount3()
    render(
      <Popup
        modelList={[makeModel({ models: [makeModelItem({ features: undefined })] })]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
        scopeFeatures={[ModelFeatureEnum.vision]}
      />,
    )
    expect(screen.getByText('No model found for “”')).toBeInTheDocument()
  })

  it('should match labels from other languages when current language key is missing', () => {
    mockLanguage = 'fr_FR'

    render(
      <Popup
        modelList={[makeModel()]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    fireEvent.change(
      screen.getByPlaceholderText('datasetSettings.form.searchModel'),
      { target: { value: 'gpt' } },
    )

    expect(screen.getByText('openai')).toBeInTheDocument()
  })

  it('should filter out model when features array exists but does not include required scopeFeature', () => {
    const modelWithToolCallOnly = makeModel({
      models: [makeModelItem({ features: [ModelFeatureEnum.toolCall] })],
    })

    render(
      <Popup
        modelList={[modelWithToolCallOnly]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
        scopeFeatures={[ModelFeatureEnum.vision]}
      />,
    )

    // The model item should be filtered out because it has toolCall but not vision
    expect(screen.queryByText('openai')).not.toBeInTheDocument()
  })

  it('should close tooltip on scroll', () => {
    const { container } = render(
      <Popup
        modelList={[makeModel()]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    fireEvent.scroll(container.firstElementChild as HTMLElement)
    expect(closeActiveTooltipSpy).toHaveBeenCalled()
  })

  it('should open provider settings when clicking footer link', () => {
    render(
      <Popup
        modelList={[makeModel()]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('common.model.settingsLink'))

    expect(mockSetShowAccountSettingModal).toHaveBeenCalledWith({
      payload: 'provider',
    })
  })

  it('should call onHide when footer settings link is clicked', () => {
    const mockOnHide = vi.fn()
    render(
      <Popup
        modelList={[makeModel()]}
        onSelect={vi.fn()}
        onHide={mockOnHide}
      />,
    )

    fireEvent.click(screen.getByText('common.model.settingsLink'))

    expect(mockOnHide).toHaveBeenCalled()
  })

  it('should match model label when searchText is non-empty and label key exists for current language', () => {
    render(
      <Popup
        modelList={[makeModel()]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    // GPT-4 label has en_US key, so modelItem.label[language] is defined
    const input = screen.getByPlaceholderText('datasetSettings.form.searchModel')
    fireEvent.change(input, { target: { value: 'gpt' } })

  it('should show installed marketplace providers without models when AI credits are available', () => {
    mockContextModelProviders.current = [makeContextProvider({
      provider: 'test-anthropic',
      system_configuration: {
        enabled: true,
      } as MockContextProvider['system_configuration'],
    })]

    render(
      <Popup
        modelList={[]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    expect(screen.getByText('test-anthropic')).toBeInTheDocument()
    expect(screen.getByText('TestOpenAI')).toBeInTheDocument()
  })

  it('should hide installed marketplace providers without models when AI credits are exhausted', () => {
    Object.assign(mockTrialCredits, {
      credits: 0,
      totalCredits: 200,
      isExhausted: true,
    })
    mockContextModelProviders.current = [makeContextProvider({
      provider: 'test-anthropic',
      system_configuration: {
        enabled: true,
      } as MockContextProvider['system_configuration'],
    })]

    render(
      <Popup
        modelList={[]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    expect(screen.queryByText('test-anthropic')).not.toBeInTheDocument()
    expect(screen.queryByText('TestAnthropic')).not.toBeInTheDocument()
    expect(screen.getByText('TestOpenAI')).toBeInTheDocument()
  })

  it('should toggle marketplace section collapse', () => {
    render(
      <Popup
        modelList={[]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    expect(screen.getByText('TestOpenAI')).toBeInTheDocument()

    fireEvent.click(screen.getByText(/modelProvider\.selector\.fromMarketplace/))

    expect(screen.queryByText('TestOpenAI')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(/modelProvider\.selector\.fromMarketplace/))

    expect(screen.getByText('TestOpenAI')).toBeInTheDocument()
  })

  it('should install plugin when clicking install button', async () => {
    mockMarketplacePlugins.current = [
      { plugin_id: 'langgenius/openai', latest_package_identifier: 'langgenius/openai:1.0.0' },
    ]
    mockInstallMutateAsync.mockResolvedValue({ all_installed: true, task_id: 'task-1' })

    render(
      <Popup
        modelList={[]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    const installButtons = screen.getAllByText(/common\.modelProvider\.selector\.install/)
    fireEvent.click(installButtons[0])

    await waitFor(() => {
      expect(mockInstallMutateAsync).toHaveBeenCalledWith('langgenius/openai:1.0.0')
    })
    expect(mockRefreshPluginList).toHaveBeenCalled()
  })

  it('should handle install failure gracefully', async () => {
    mockMarketplacePlugins.current = [
      { plugin_id: 'langgenius/openai', latest_package_identifier: 'langgenius/openai:1.0.0' },
    ]
    mockInstallMutateAsync.mockRejectedValue(new Error('Install failed'))

    render(
      <Popup
        modelList={[]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    const installButtons = screen.getAllByText(/common\.modelProvider\.selector\.install/)
    fireEvent.click(installButtons[0])

    await waitFor(() => {
      expect(mockInstallMutateAsync).toHaveBeenCalled()
    })

    // Should not crash, install buttons should still be available
    expect(screen.getAllByText(/common\.modelProvider\.selector\.install/).length).toBeGreaterThan(0)
  })

  it('should run checkTaskStatus when not all_installed', async () => {
    mockMarketplacePlugins.current = [
      { plugin_id: 'langgenius/openai', latest_package_identifier: 'langgenius/openai:1.0.0' },
    ]
    mockInstallMutateAsync.mockResolvedValue({ all_installed: false, task_id: 'task-1' })
    mockCheck.mockResolvedValue(undefined)

    render(
      <Popup
        modelList={[]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    const installButtons = screen.getAllByText(/common\.modelProvider\.selector\.install/)
    fireEvent.click(installButtons[0])

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalledWith({
        taskId: 'task-1',
        pluginUniqueIdentifier: 'langgenius/openai:1.0.0',
      })
    })
    expect(mockRefreshPluginList).toHaveBeenCalled()
  })

  it('should skip install requests when marketplace plugins are still loading', async () => {
    mockMarketplacePlugins.current = [
      { plugin_id: 'langgenius/openai', latest_package_identifier: 'langgenius/openai:1.0.0' },
    ]
    mockMarketplacePlugins.isLoading = true

    render(
      <Popup
        modelList={[]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    fireEvent.click(screen.getAllByText(/common\.modelProvider\.selector\.install/)[0])

    await waitFor(() => {
      expect(mockInstallMutateAsync).not.toHaveBeenCalled()
    })
  })

  it('should skip install requests when the marketplace plugin cannot be found', async () => {
    mockMarketplacePlugins.current = []

    render(
      <Popup
        modelList={[]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    fireEvent.click(screen.getAllByText(/common\.modelProvider\.selector\.install/)[0])

    await waitFor(() => {
      expect(mockInstallMutateAsync).not.toHaveBeenCalled()
    })
  })

  it('should sort the selected provider to the top when a default model is provided', () => {
    render(
      <Popup
        defaultModel={{ provider: 'anthropic', model: 'claude-3' }}
        modelList={[
          makeModel({ provider: 'openai', label: { en_US: 'OpenAI', zh_Hans: 'OpenAI' } }),
          makeModel({ provider: 'anthropic', label: { en_US: 'Anthropic', zh_Hans: 'Anthropic' } }),
        ]}
        onSelect={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    const providerLabels = screen.getAllByText(/openai|anthropic/)
    expect(providerLabels[0]).toHaveTextContent('anthropic')
  })
})
