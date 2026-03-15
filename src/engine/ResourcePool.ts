export type ResourcePoolTextureName =
  | 'beautyProcessed'
  | 'clipEffectA'
  | 'clipEffectB'
  | 'composited'
  | 'layerComposite'
  | 'original'
  | 'processed'
  | 'refinedMask';

type ResourceDescriptor =
  | {
      readonly kind: 'texture';
      readonly name: ResourcePoolTextureName;
    }
  | {
      readonly kind: 'render-target';
      readonly name: ResourcePoolTextureName;
    };

interface ResourceEntry {
  framebuffer: WebGLFramebuffer | null;
  readonly kind: ResourceDescriptor['kind'];
  texture: WebGLTexture;
}

function initializeTextureParameters(
  context: WebGLRenderingContext,
  texture: WebGLTexture,
): void {
  context.bindTexture(context.TEXTURE_2D, texture);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
}

function resolveClampedRenderTargetSize(
  context: WebGLRenderingContext,
  width: number,
  height: number,
): {
  readonly height: number;
  readonly width: number;
} {
  const maxTextureSize = context.getParameter(context.MAX_TEXTURE_SIZE) as number;
  const maxRenderbufferSize = context.getParameter(context.MAX_RENDERBUFFER_SIZE) as number;
  const maxDimension = Math.max(1, Math.min(maxTextureSize, maxRenderbufferSize));
  const scaleFactor = Math.min(1, maxDimension / width, maxDimension / height);

  return {
    height: Math.max(1, Math.floor(height * scaleFactor)),
    width: Math.max(1, Math.floor(width * scaleFactor)),
  };
}

function getNextFallbackDimension(currentDimension: number): number {
  if (currentDimension <= 1) {
    return 1;
  }

  return Math.max(1, Math.floor(currentDimension * 0.75));
}

export class ResourcePool {
  private allocatedHeight = 1;

  private allocatedWidth = 1;

  private readonly entries = new Map<ResourcePoolTextureName, ResourceEntry>();

  private readonly externalTextures = new Map<string, WebGLTexture>();

  private memoryUsageBytes = 0;

  private qualityScale = 1;

  public constructor(private readonly descriptors: readonly ResourceDescriptor[]) {}

  dispose(context: WebGLRenderingContext): void {
    this.entries.forEach((entry: ResourceEntry): void => {
      if (entry.framebuffer !== null) {
        context.deleteFramebuffer(entry.framebuffer);
      }

      context.deleteTexture(entry.texture);
    });
    this.entries.clear();
    this.externalTextures.forEach((texture: WebGLTexture): void => {
      context.deleteTexture(texture);
    });
    this.externalTextures.clear();
  }

  getFramebuffer(name: Exclude<ResourcePoolTextureName, 'original'>): WebGLFramebuffer {
    const entry = this.entries.get(name);

    if (entry === undefined || entry.framebuffer === null) {
      throw new Error(`Framebuffer "${name}" was requested before initialization.`);
    }

    return entry.framebuffer;
  }

  getTexture(name: ResourcePoolTextureName): WebGLTexture {
    const entry = this.entries.get(name);

    if (entry === undefined) {
      throw new Error(`Texture "${name}" was requested before initialization.`);
    }

    return entry.texture;
  }

  releaseExternalTexture(context: WebGLRenderingContext, sourceId: string): void {
    const texture = this.externalTextures.get(sourceId);

    if (texture === undefined) {
      return;
    }

    context.deleteTexture(texture);
    this.externalTextures.delete(sourceId);
  }

  getMemoryUsageBytes(): number {
    return this.memoryUsageBytes;
  }

  getExternalTexture(sourceId: string): WebGLTexture | null {
    return this.externalTextures.get(sourceId) ?? null;
  }

  getExternalTextureIds(): readonly string[] {
    return [...this.externalTextures.keys()];
  }

  getQualityScale(): number {
    return this.qualityScale;
  }

  getRenderTargetHeight(): number {
    return this.allocatedHeight;
  }

  getRenderTargetWidth(): number {
    return this.allocatedWidth;
  }

  initialize(
    context: WebGLRenderingContext,
    width: number,
    height: number,
    qualityScale = 1,
  ): void {
    this.dispose(context);
    this.qualityScale = Math.max(0.25, Math.min(1, qualityScale));

    this.descriptors.forEach((descriptor: ResourceDescriptor): void => {
      const texture = context.createTexture();

      if (texture === null) {
        throw new Error(`Failed to create the ${descriptor.name} texture.`);
      }

      initializeTextureParameters(context, texture);

      if (descriptor.kind === 'texture') {
        this.entries.set(descriptor.name, {
          framebuffer: null,
          kind: descriptor.kind,
          texture,
        });
        return;
      }

      const framebuffer = context.createFramebuffer();

      if (framebuffer === null) {
        context.deleteTexture(texture);
        throw new Error(`Failed to create the ${descriptor.name} framebuffer.`);
      }

      this.entries.set(descriptor.name, {
        framebuffer,
        kind: descriptor.kind,
        texture,
      });
    });

    this.resize(context, width, height, this.qualityScale);
  }

  resize(
    context: WebGLRenderingContext,
    width: number,
    height: number,
    qualityScale = this.qualityScale,
  ): void {
    const normalizedQualityScale = Math.max(0.25, Math.min(1, qualityScale));
    const requestedWidth = Math.max(1, Math.floor(width * normalizedQualityScale));
    const requestedHeight = Math.max(1, Math.floor(height * normalizedQualityScale));
    const stableSize = this.resolveStableRenderTargetSize(
      context,
      requestedWidth,
      requestedHeight,
    );
    const nextAllocatedWidth = stableSize.width;
    const nextAllocatedHeight = stableSize.height;

    this.qualityScale = normalizedQualityScale;

    this.allocatedWidth = nextAllocatedWidth;
    this.allocatedHeight = nextAllocatedHeight;
    this.configureRenderTargets(context, nextAllocatedWidth, nextAllocatedHeight);

    this.memoryUsageBytes =
      this.descriptors.filter((descriptor: ResourceDescriptor): boolean => descriptor.kind === 'render-target').length *
      this.allocatedWidth *
      this.allocatedHeight *
      4;
    context.bindFramebuffer(context.FRAMEBUFFER, null);
  }

  private configureRenderTargets(
    context: WebGLRenderingContext,
    width: number,
    height: number,
  ): boolean {
    for (const [, entry] of this.entries) {
      if (entry.kind !== 'render-target' || entry.framebuffer === null) {
        continue;
      }

      context.bindTexture(context.TEXTURE_2D, entry.texture);
      context.texImage2D(
        context.TEXTURE_2D,
        0,
        context.RGBA,
        width,
        height,
        0,
        context.RGBA,
        context.UNSIGNED_BYTE,
        null,
      );
      context.bindFramebuffer(context.FRAMEBUFFER, entry.framebuffer);
      context.framebufferTexture2D(
        context.FRAMEBUFFER,
        context.COLOR_ATTACHMENT0,
        context.TEXTURE_2D,
        entry.texture,
        0,
      );

      if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
        context.bindFramebuffer(context.FRAMEBUFFER, null);
        return false;
      }
    }

    context.bindFramebuffer(context.FRAMEBUFFER, null);
    return true;
  }

  private resolveStableRenderTargetSize(
    context: WebGLRenderingContext,
    requestedWidth: number,
    requestedHeight: number,
  ): {
    readonly height: number;
    readonly width: number;
  } {
    let { width, height } = resolveClampedRenderTargetSize(
      context,
      requestedWidth,
      requestedHeight,
    );

    while (true) {
      if (this.configureRenderTargets(context, width, height)) {
        return {
          height,
          width,
        };
      }

      if (width === 1 && height === 1) {
        const maxTextureSize = context.getParameter(context.MAX_TEXTURE_SIZE) as number;
        const maxRenderbufferSize = context.getParameter(
          context.MAX_RENDERBUFFER_SIZE,
        ) as number;
        throw new Error(
          `Render targets could not be initialized even after falling back to 1x1. Requested ${requestedWidth}x${requestedHeight}, GPU limits ${maxTextureSize}x${maxRenderbufferSize}.`,
        );
      }

      const nextWidth = getNextFallbackDimension(width);
      const nextHeight = getNextFallbackDimension(height);

      if (nextWidth === width && nextHeight === height) {
        throw new Error(
          `Render targets could not be initialized at ${width}x${height}.`,
        );
      }

      width = nextWidth;
      height = nextHeight;
    }
  }

  updateExternalTexture(
    context: WebGLRenderingContext,
    sourceId: string,
    sourceElement: TexImageSource,
  ): WebGLTexture {
    let texture = this.externalTextures.get(sourceId);

    if (texture === undefined) {
      texture = context.createTexture();

      if (texture === null) {
        throw new Error(`Failed to allocate an external texture for source "${sourceId}".`);
      }

      initializeTextureParameters(context, texture);
      this.externalTextures.set(sourceId, texture);
    }

    context.bindTexture(context.TEXTURE_2D, texture);
    context.texImage2D(
      context.TEXTURE_2D,
      0,
      context.RGBA,
      context.RGBA,
      context.UNSIGNED_BYTE,
      sourceElement,
    );

    return texture;
  }
}
