import { expect, test, type Page } from '@playwright/test';
import { installFakeStudioRuntime } from './helpers/installFakeStudioRuntime';

type StartupScenarioId =
  | 'both-contexts-blocked'
  | 'primary-context-lost'
  | 'primary-unreadable-limits';

interface StartupScenario {
  readonly expectedExperimentalContext: 'available' | 'blocked';
  readonly expectedFailureMessage: string;
  readonly expectedFailureReason: string;
  readonly expectedWebglContext: 'available' | 'blocked';
  readonly id: StartupScenarioId;
  readonly title: string;
}

const startupScenarios: readonly StartupScenario[] = [
  {
    expectedExperimentalContext: 'blocked',
    expectedFailureMessage:
      'WebGL is unavailable in this browser or is currently blocked by GPU/driver settings.',
    expectedFailureReason: 'WebGL unavailable',
    expectedWebglContext: 'blocked',
    id: 'both-contexts-blocked',
    title: 'classifies null WebGL startup fallback',
  },
  {
    expectedExperimentalContext: 'blocked',
    expectedFailureMessage: 'WebGL context was acquired in a lost state.',
    expectedFailureReason: 'context acquired lost',
    expectedWebglContext: 'available',
    id: 'primary-context-lost',
    title: 'classifies lost-on-acquire startup via the primary webgl context',
  },
  {
    expectedExperimentalContext: 'blocked',
    expectedFailureMessage:
      'WebGL context was acquired but GPU render-target limits were unreadable.',
    expectedFailureReason: 'GPU limits unreadable',
    expectedWebglContext: 'available',
    id: 'primary-unreadable-limits',
    title: 'classifies unreadable GPU-limit startup failure',
  },
];

async function installWebglStartupFailureScenario(
  page: Page,
  scenarioId: StartupScenarioId,
): Promise<void> {
  await page.addInitScript((scenario: StartupScenarioId): void => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    function createMockWebglContext(
      mode: 'lost' | 'unreadable-limits',
    ): RenderingContext {
      return {
        COLOR_BUFFER_BIT: 0x4000,
        MAX_RENDERBUFFER_SIZE: 0x84e8,
        MAX_TEXTURE_SIZE: 0x0d33,
        RGBA: 0x1908,
        TEXTURE_2D: 0x0de1,
        UNSIGNED_BYTE: 0x1401,
        clear(): void {
          return undefined;
        },
        createShader(): object {
          return {};
        },
        getExtension(): null {
          return null;
        },
        getParameter(parameter: number): number | null {
          if (mode === 'unreadable-limits') {
            return 0;
          }

          if (parameter === 0x84e8 || parameter === 0x0d33) {
            return 4096;
          }

          return null;
        },
        isContextLost(): boolean {
          return mode === 'lost';
        },
        texImage2D(): void {
          return undefined;
        },
        viewport(): void {
          return undefined;
        },
      } as unknown as RenderingContext;
    }

    HTMLCanvasElement.prototype.getContext = function patchedGetContext(
      this: HTMLCanvasElement,
      contextId: string,
      options?: unknown,
    ): RenderingContext | null {
      if (contextId === '2d') {
        return originalGetContext.call(this, contextId, options as never);
      }

      if (!this.isConnected) {
        return originalGetContext.call(this, contextId, options as never);
      }

      switch (scenario) {
        case 'both-contexts-blocked':
          return contextId === 'webgl' || contextId === 'experimental-webgl'
            ? null
            : originalGetContext.call(this, contextId, options as never);
        case 'primary-context-lost':
          if (contextId === 'webgl') {
            return createMockWebglContext('lost');
          }

          if (contextId === 'experimental-webgl') {
            return null;
          }

          return originalGetContext.call(this, contextId, options as never);
        case 'primary-unreadable-limits':
          if (contextId === 'webgl') {
            return createMockWebglContext('unreadable-limits');
          }

          if (contextId === 'experimental-webgl') {
            return null;
          }

          return originalGetContext.call(this, contextId, options as never);
        default:
          return originalGetContext.call(this, contextId, options as never);
      }
    };
  }, scenarioId);
}

test.beforeEach(async ({ page }): Promise<void> => {
  await installFakeStudioRuntime(page);
});

for (const scenario of startupScenarios) {
  test(scenario.title, async ({ page }): Promise<void> => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (message): void => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error): void => {
      pageErrors.push(error.message);
    });

    await installWebglStartupFailureScenario(page, scenario.id);
    await page.goto('/');

    await expect(page.getByText('Viewfinder Output')).toBeVisible();
    await expect(page.getByText(scenario.expectedFailureMessage)).toBeVisible();
    await expect(page.getByText('active backend: canvas-2d')).toBeVisible();
    await expect(page.getByText('runtime status: fallback')).toBeVisible();
    await expect(
      page.getByText(`failure reason: ${scenario.expectedFailureReason}`),
    ).toBeVisible();
    await expect(
      page.getByText(`\`webgl\` context: ${scenario.expectedWebglContext}`),
    ).toBeVisible();
    await expect(
      page.getByText(
        `\`experimental-webgl\` context: ${scenario.expectedExperimentalContext}`,
      ),
    ).toBeVisible();
    await expect(page.getByText('Canvas 2D', { exact: true })).toBeVisible();
    await expect(page.getByText('Rendering camera texture to Canvas 2D fallback')).toBeVisible();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
