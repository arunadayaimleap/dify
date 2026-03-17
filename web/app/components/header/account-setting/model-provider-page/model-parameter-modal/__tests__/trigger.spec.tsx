import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import Trigger from '../trigger'

const mockUseCredentialPanelState = vi.fn()

vi.mock('../../hooks', () => ({
  useLanguage: () => 'en_US',
}))

vi.mock('@/context/provider-context', () => ({
  useProviderContext: () => ({
    modelProviders: [{ provider: 'openai', label: { en_US: 'OpenAI' } }],
  }),
}))

vi.mock('../../provider-added-card/use-credential-panel-state', () => ({
  useCredentialPanelState: () => mockUseCredentialPanelState(),
}))

vi.mock('../../model-icon', () => ({
  default: () => <div data-testid="model-icon">Icon</div>,
}))

vi.mock('../../model-name', () => ({
  default: ({
    modelItem,
    showMode,
    showFeatures,
  }: {
    modelItem: { model: string }
    showMode?: boolean
    showFeatures?: boolean
  }) => (
    <div>
      <span>{modelItem.model}</span>
      {showMode && <span data-testid="model-name-mode">mode</span>}
      {showFeatures && <span data-testid="model-name-features">features</span>}
    </div>
  ),
}))

describe('Trigger', () => {
  const currentProvider = { provider: 'openai', label: { en_US: 'OpenAI' } } as unknown as ComponentProps<typeof Trigger>['currentProvider']
  const currentModel = { model: 'gpt-4' } as unknown as ComponentProps<typeof Trigger>['currentModel']

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render initialized state', () => {
    render(
      <Trigger
        currentProvider={currentProvider}
        currentModel={currentModel}
      />,
    )
    expect(screen.getByText('gpt-4')).toBeInTheDocument()
    expect(screen.getByTestId('model-icon')).toBeInTheDocument()
  })

  describe('Status badges', () => {
    it('should render credits exhausted badge in non-workflow mode', () => {
      mockUseCredentialPanelState.mockReturnValue({
        ...activeCredentialState,
        variant: 'credits-exhausted',
        isCreditsExhausted: true,
        priority: 'credits',
      })

      render(
        <Trigger
          currentProvider={currentProvider}
          currentModel={currentModel}
          providerName="openai"
          modelId="gpt-4"
        />,
      )

      expect(screen.getByText('common.modelProvider.selector.creditsExhausted')).toBeInTheDocument()
      expect(screen.queryByTestId('model-name-mode')).not.toBeInTheDocument()
      expect(screen.queryByTestId('model-name-features')).not.toBeInTheDocument()
    })

    it('should render api unavailable badge in non-workflow mode', () => {
      mockUseCredentialPanelState.mockReturnValue({
        ...activeCredentialState,
        variant: 'api-unavailable',
      })

      render(
        <Trigger
          currentProvider={currentProvider}
          currentModel={currentModel}
          providerName="openai"
          modelId="gpt-4"
        />,
      )

      expect(screen.getByText('common.modelProvider.selector.apiKeyUnavailable')).toBeInTheDocument()
    })

    it('should render credits exhausted badge in workflow mode', () => {
      mockUseCredentialPanelState.mockReturnValue({
        ...activeCredentialState,
        variant: 'credits-exhausted',
        isCreditsExhausted: true,
        priority: 'credits',
      })

      render(
        <Trigger
          currentProvider={currentProvider}
          currentModel={currentModel}
          providerName="openai"
          modelId="gpt-4"
          isInWorkflow
        />,
      )

      expect(screen.getByText('common.modelProvider.selector.creditsExhausted')).toBeInTheDocument()
    })

    it('should render api unavailable badge in workflow mode', () => {
      mockUseCredentialPanelState.mockReturnValue({
        ...activeCredentialState,
        variant: 'api-unavailable',
      })

      render(
        <Trigger
          currentProvider={currentProvider}
          currentModel={currentModel}
          providerName="openai"
          modelId="gpt-4"
          isInWorkflow
        />,
      )

      expect(screen.getByText('common.modelProvider.selector.apiKeyUnavailable')).toBeInTheDocument()
    })

    it('should render incompatible badge when model is deprecated (currentModel missing)', () => {
      render(
        <Trigger
          currentProvider={currentProvider}
          providerName="openai"
          modelId="gpt-4"
        />,
      )

      expect(screen.getByText('common.modelProvider.selector.incompatible')).toBeInTheDocument()
    })

    it('should render credits exhausted badge when model is missing and AI credits are exhausted without api key', () => {
      mockUseCredentialPanelState.mockReturnValue({
        ...activeCredentialState,
        variant: 'no-usage',
        priority: 'apiKey',
        hasCredentials: false,
        isCreditsExhausted: true,
        credentialName: undefined,
      })

      render(
        <Trigger
          currentProvider={currentProvider}
          providerName="openai"
          modelId="gpt-4"
        />,
      )

      expect(screen.getByText('common.modelProvider.selector.creditsExhausted')).toBeInTheDocument()
    })

    it('should render configure required badge when model status is no-configure', () => {
      render(
        <Trigger
          currentProvider={currentProvider}
          currentModel={{ ...currentModel, status: 'no-configure' } as typeof currentModel}
          providerName="openai"
          modelId="gpt-4"
        />,
      )

      expect(screen.getByText('common.modelProvider.selector.configureRequired')).toBeInTheDocument()
    })

    it('should render disabled badge when model status is disabled', () => {
      render(
        <Trigger
          currentProvider={currentProvider}
          currentModel={{ ...currentModel, status: 'disabled' } as typeof currentModel}
          providerName="openai"
          modelId="gpt-4"
        />,
      )

      expect(screen.getByText('common.modelProvider.selector.disabled')).toBeInTheDocument()
    })

    it('should render incompatible badge when provider plugin is not installed', () => {
      render(
        <Trigger
          modelId="gpt-4"
          providerName="unknown-provider"
        />,
      )

      expect(screen.getByText('common.modelProvider.selector.incompatible')).toBeInTheDocument()
    })
  })

  // isInWorkflow=true: workflow border class + RiArrowDownSLine arrow
  it('should render workflow styles when isInWorkflow is true', () => {
    // Act
    const { container } = render(
      <Trigger
        currentProvider={currentProvider}
        currentModel={currentModel}
        isInWorkflow
      />,
    )

    // Assert
    expect(container.firstChild).toHaveClass('border-workflow-block-parma-bg')
    expect(container.firstChild).toHaveClass('bg-workflow-block-parma-bg')
    expect(container.querySelectorAll('svg').length).toBe(2)
  })

  // disabled=true + hasDeprecated=true: AlertTriangle + deprecated tooltip
  it('should show deprecated warning when disabled with hasDeprecated', () => {
    // Act
    render(
      <Trigger
        currentProvider={currentProvider}
        currentModel={currentModel}
        disabled
        hasDeprecated
      />,
    )

    // Assert - AlertTriangle renders with warning color
    const warningIcon = document.querySelector('.text-\\[\\#F79009\\]')
    expect(warningIcon).toBeInTheDocument()
  })

  // disabled=true + modelDisabled=true: status text tooltip
  it('should show model status tooltip when disabled with modelDisabled', () => {
    // Act
    render(
      <Trigger
        currentProvider={currentProvider}
        currentModel={{ ...currentModel, status: 'no-configure' } as unknown as typeof currentModel}
        disabled
        modelDisabled
      />,
    )

    // Assert - AlertTriangle warning icon should be present
    const warningIcon = document.querySelector('.text-\\[\\#F79009\\]')
    expect(warningIcon).toBeInTheDocument()
  })

  it('should render empty tooltip content when disabled without deprecated or modelDisabled', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Trigger
        currentProvider={currentProvider}
        currentModel={currentModel}
        disabled
        hasDeprecated={false}
        modelDisabled={false}
      />,
    )
    const warningIcon = document.querySelector('.text-\\[\\#F79009\\]')
    expect(warningIcon).toBeInTheDocument()
    const trigger = container.querySelector('[data-state]')
    expect(trigger).toBeInTheDocument()
    await user.hover(trigger as HTMLElement)
    const tooltip = screen.queryByRole('tooltip')
    if (tooltip)
      expect(tooltip).toBeEmptyDOMElement()
    expect(screen.queryByText('modelProvider.deprecated')).not.toBeInTheDocument()
    expect(screen.queryByText('No Configure')).not.toBeInTheDocument()
  })

  // providerName not matching any provider: find() returns undefined
  it('should render without crashing when providerName does not match any provider', () => {
    // Act
    render(
      <Trigger
        modelId="gpt-4"
        providerName="unknown-provider"
      />,
    )

    // Assert
    expect(screen.getByText('gpt-4')).toBeInTheDocument()
  })
})
