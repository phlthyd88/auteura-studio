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
    const nextAllocatedWidth = Math.max(1, Math.floor(width * normalizedQualityScale));
    const nextAllocatedHeight = Math.max(1, Math.floor(height * normalizedQualityScale));
    const qualityScaleChanged = normalizedQualityScale !== this.qualityScale;

    this.qualityScale = normalizedQualityScale;

    if (qualityScaleChanged) {
      this.recreateRenderTargets(context, nextAllocatedWidth, nextAllocatedHeight);
      return;
    }

    this.allocatedWidth = nextAllocatedWidth;
    this.allocatedHeight = nextAllocatedHeight;
    this.entries.forEach((entry: ResourceEntry, name: ResourcePoolTextureName): void => {
      if (entry.kind !== 'render-target' || entry.framebuffer === null) {
        return;
      }

      context.bindTexture(context.TEXTURE_2D, entry.texture);
      context.texImage2D(
        context.TEXTURE_2D,
        0,
        context.RGBA,
        nextAllocatedWidth,
        nextAllocatedHeight,
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
        throw new Error(`Render target "${name}" could not be initialized.`);
      }
    });

    this.memoryUsageBytes =
      this.descriptors.filter((descriptor: ResourceDescriptor): boolean => descriptor.kind === 'render-target').length *
      this.allocatedWidth *
      this.allocatedHeight *
      4;
    context.bindFramebuffer(context.FRAMEBUFFER, null);
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

  private recreateRenderTargets(
    context: WebGLRenderingContext,
    width: number,
    height: number,
  ): void {
    this.descriptors.forEach((descriptor: ResourceDescriptor): void => {
      if (descriptor.kind !== 'render-target') {
        return;
      }

      const previousEntry = this.entries.get(descriptor.name);

      if (previousEntry !== undefined) {
        if (previousEntry.framebuffer !== null) {
          context.deleteFramebuffer(previousEntry.framebuffer);
        }

        context.deleteTexture(previousEntry.texture);
      }

      const texture = context.createTexture();
      const framebuffer = context.createFramebuffer();

      if (texture === null || framebuffer === null) {
        if (texture !== null) {
          context.deleteTexture(texture);
        }

        if (framebuffer !== null) {
          context.deleteFramebuffer(framebuffer);
        }

        throw new Error(`Failed to recreate the ${descriptor.name} render target.`);
      }

      initializeTextureParameters(context, texture);
      this.entries.set(descriptor.name, {
        framebuffer,
        kind: 'render-target',
        texture,
      });
    });

    this.allocatedWidth = width;
    this.allocatedHeight = height;
    this.entries.forEach((entry: ResourceEntry, name: ResourcePoolTextureName): void => {
      if (entry.kind !== 'render-target' || entry.framebuffer === null) {
        return;
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
        throw new Error(`Render target "${name}" could not be reinitialized.`);
      }
    });

    this.memoryUsageBytes =
      this.descriptors.filter((descriptor: ResourceDescriptor): boolean => descriptor.kind === 'render-target').length *
      this.allocatedWidth *
      this.allocatedHeight *
      4;
    context.bindFramebuffer(context.FRAMEBUFFER, null);
  }
}
