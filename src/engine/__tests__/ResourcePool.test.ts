import { describe, expect, it, vi } from 'vitest';
import { ResourcePool, type ResourcePoolTextureName } from '../ResourcePool';

function createContextMock(options?: {
  readonly incompleteAboveDimension?: number;
}): {
  readonly context: WebGLRenderingContext;
  readonly createFramebuffer: ReturnType<typeof vi.fn>;
  readonly createTexture: ReturnType<typeof vi.fn>;
} {
  const textures = new Set<object>();
  const framebuffers = new Set<object>();
  let lastAllocatedWidth = 1;
  let lastAllocatedHeight = 1;
  const createFramebuffer = vi.fn(() => {
    const framebuffer = {};
    framebuffers.add(framebuffer);
    return framebuffer as WebGLFramebuffer;
  });
  const createTexture = vi.fn(() => {
    const texture = {};
    textures.add(texture);
    return texture as WebGLTexture;
  });

  return {
    context: {
    CLAMP_TO_EDGE: 0x812f,
    COLOR_ATTACHMENT0: 0x8ce0,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    LINEAR: 0x2601,
    MAX_RENDERBUFFER_SIZE: 0x84e8,
    MAX_TEXTURE_SIZE: 0x0d33,
    RGBA: 0x1908,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    UNSIGNED_BYTE: 0x1401,
    bindFramebuffer: vi.fn(),
    bindTexture: vi.fn(),
    checkFramebufferStatus: vi.fn(() => {
      if (
        options?.incompleteAboveDimension !== undefined &&
        (lastAllocatedWidth > options.incompleteAboveDimension ||
          lastAllocatedHeight > options.incompleteAboveDimension)
      ) {
        return 0;
      }

      return 0x8cd5;
    }),
    createFramebuffer,
    createTexture,
    deleteFramebuffer: vi.fn((framebuffer: WebGLFramebuffer | null) => {
      if (framebuffer !== null) {
        framebuffers.delete(framebuffer as unknown as object);
      }
    }),
    deleteTexture: vi.fn((texture: WebGLTexture | null) => {
      if (texture !== null) {
        textures.delete(texture as unknown as object);
      }
    }),
    framebufferTexture2D: vi.fn(),
    getParameter: vi.fn((parameter: number) => {
      if (parameter === 0x0d33 || parameter === 0x84e8) {
        return 2048;
      }

      return null;
    }),
    texImage2D: vi.fn(
      (
        _target: number,
        _level: number,
        _internalFormat: number,
        width: number,
        height: number,
      ) => {
        lastAllocatedWidth = width;
        lastAllocatedHeight = height;
      },
    ),
    texParameteri: vi.fn(),
    } as unknown as WebGLRenderingContext,
    createFramebuffer,
    createTexture,
  };
}

describe('ResourcePool', (): void => {
  it('resizes render targets in place when qualityScale changes', (): void => {
    const { context, createFramebuffer, createTexture } = createContextMock();
    const pool = new ResourcePool([
      {
        kind: 'render-target',
        name: 'beautyProcessed',
      },
      {
        kind: 'texture',
        name: 'original',
      },
    ] satisfies readonly {
      kind: 'render-target' | 'texture';
      name: ResourcePoolTextureName;
    }[]);

    pool.initialize(context, 640, 360, 1);
    const createTextureCallCountAfterInit = createTexture.mock.calls.length;
    const createFramebufferCallCountAfterInit = createFramebuffer.mock.calls.length;

    pool.resize(context, 640, 360, 0.65);

    expect(createTexture).toHaveBeenCalledTimes(createTextureCallCountAfterInit);
    expect(createFramebuffer).toHaveBeenCalledTimes(createFramebufferCallCountAfterInit);
  });

  it('clamps render-target dimensions to GPU limits before allocation', (): void => {
    const { context } = createContextMock();
    const pool = new ResourcePool([
      {
        kind: 'render-target',
        name: 'beautyProcessed',
      },
      {
        kind: 'texture',
        name: 'original',
      },
    ] satisfies readonly {
      kind: 'render-target' | 'texture';
      name: ResourcePoolTextureName;
    }[]);

    pool.initialize(context, 6000, 3000, 1);

    expect(pool.getRenderTargetWidth()).toBeLessThanOrEqual(2048);
    expect(pool.getRenderTargetHeight()).toBeLessThanOrEqual(2048);
  });

  it('falls back to smaller render-target dimensions when the framebuffer is incomplete', (): void => {
    const { context } = createContextMock({
      incompleteAboveDimension: 1024,
    });
    const pool = new ResourcePool([
      {
        kind: 'render-target',
        name: 'beautyProcessed',
      },
      {
        kind: 'texture',
        name: 'original',
      },
    ] satisfies readonly {
      kind: 'render-target' | 'texture';
      name: ResourcePoolTextureName;
    }[]);

    pool.initialize(context, 1600, 1200, 1);

    expect(pool.getRenderTargetWidth()).toBeLessThanOrEqual(1024);
    expect(pool.getRenderTargetHeight()).toBeLessThanOrEqual(1024);
  });
});
