# Controller Facade Contracts

The controller hooks in `src/controllers` are the stable React-facing facades for the studio runtime. Internal extraction work may move logic into services or coordinators, but it must preserve these public contracts unless a ticket explicitly approves a breaking change.

## Contract Rules

- The public facade is the exported hook plus the corresponding context value interface in the controller file.
- Preserve field names, nullability, state meaning, and command side effects when extracting internals.
- Keep low-level runtime objects private. New services may be introduced behind the facade, not exposed through it.
- Update characterization tests before or alongside any intentional contract change.

## useRenderController

Source: [`src/controllers/RenderController.tsx`](../../src/controllers/RenderController.tsx)

Public responsibility:

- own renderer lifecycle, diagnostics publication, backend fallback, and context-loss recovery
- expose monitor-adjustment state for LUTs, looks, overlays, transforms, and comparison/mask controls
- publish timeline-preview state and virtual-output status to the React layer
- expose scene-insight state derived from the rendered monitor surface

Protected consumers:

- [`src/components/layout/Viewfinder.tsx`](../../src/components/layout/Viewfinder.tsx)
- [`src/components/layout/AppLayout.tsx`](../../src/components/layout/AppLayout.tsx)
- [`src/components/RenderSettingsPanel.tsx`](../../src/components/RenderSettingsPanel.tsx)
- [`src/components/SceneInsightsPanel.tsx`](../../src/components/SceneInsightsPanel.tsx)
- [`src/components/BrowserCameraSetupPanel.tsx`](../../src/components/BrowserCameraSetupPanel.tsx)

Stable output shape:

- renderer runtime state:
  - `rendererRuntime`
  - `rendererError`
  - `webglDiagnostics`
  - `isContextLost`
- render controls:
  - `mode`, `cycleRenderMode`, `setMode`
  - `colorGrading`, `setColorGrading`
  - `comparisonConfig`, `setComparisonConfig`
  - `maskRefinementConfig`, `setMaskRefinementConfig`
  - `overlayConfig`, `setOverlayConfig`
  - `pictureInPictureConfig`, `setPictureInPictureConfig`
  - `transform`, `setTransform`
  - `applyCameraAssistRenderSettings`, `resetRenderSettings`
- LUT and look workflows:
  - `availableLuts`, `activeLutId`, `setActiveLutId`
  - `importLutFile`, `deleteImportedLut`
  - `lookPresets`, `saveCurrentLookPreset`, `applyLookPreset`, `deleteLookPreset`
  - `isLutLoading`, `isLutImporting`, `isLookPresetSaving`
  - `lutLoadError`, `lutImportError`
- preview/publication state:
  - `canvasRef`
  - `previewSourceMode`, `previewStatus`
  - `sceneAnalysis`
  - `virtualOutputStatus`
  - `bindTimelineSource`

Required invariants:

- `rendererRuntime` is the source of truth for backend, failure reason, and context-loss state.
- `rendererError === rendererRuntime.message`.
- `webglDiagnostics === rendererRuntime.diagnostics`.
- `isContextLost === rendererRuntime.isContextLost`.
- `previewSourceMode` and `previewStatus` reflect the shared timeline-preview store rather than view-local booleans.

## useAIController

Source: [`src/controllers/AIController.tsx`](../../src/controllers/AIController.tsx)

Public responsibility:

- own vision worker lifecycle, initialization state, diagnostics, and worker error publication
- gate feature availability against performance mode and asset validation
- expose camera-assist presets, beauty settings, blur settings, and processing cadence controls
- publish AI results into React-facing diagnostics while keeping worker/runtime details private

Protected consumers:

- [`src/components/AIPanel.tsx`](../../src/components/AIPanel.tsx)
- [`src/components/MonitoringOverviewPanel.tsx`](../../src/components/MonitoringOverviewPanel.tsx)
- [`src/components/PerformanceDashboard.tsx`](../../src/components/PerformanceDashboard.tsx)

Stable output shape:

- feature state:
  - `enabledFeatures`, `activeFeatures`, `setFeatureEnabled`
  - `beautyAvailable`, `beautyBlockReason`, `beautySettings`, `setBeautySettings`, `beautyRuntime`
  - `backgroundBlurAvailable`, `backgroundBlurBlockReason`
- worker/runtime state:
  - `diagnostics`
  - `initializationStage`
  - `isInitializing`
  - `isVisibilityPaused`
  - `workerError`
  - `assetValidation`, `refreshAssetValidation`
- results and presets:
  - `aiResults`
  - `cameraAssistPresets`
  - `currentCameraAssistPresetId`
  - `applyCameraAssistPreset`
  - `processingConfig`, `setProcessingConfig`

Required invariants:

- `activeFeatures` is the effective runtime feature set after policy gating, not merely the requested toggle state.
- `beautyAvailable` and `backgroundBlurAvailable` must remain explainable by their corresponding block-reason fields.
- Worker restart or init failures must surface through `diagnostics`, `initializationStage`, and `workerError` without exposing worker instances.

## useRecordingController

Source: [`src/controllers/RecordingController.tsx`](../../src/controllers/RecordingController.tsx)

Public responsibility:

- own capture-session lifecycle for recording, still capture, burst capture, timelapse, and imported media
- expose persisted media-library state and storage-budget diagnostics
- own capture-preset application and current capture profile selection

Protected consumers:

- [`src/components/RecorderPanel.tsx`](../../src/components/RecorderPanel.tsx)
- [`src/components/MediaLibrary.tsx`](../../src/components/MediaLibrary.tsx)
- [`src/components/PwaUpdatePrompt.tsx`](../../src/components/PwaUpdatePrompt.tsx)
- [`src/components/TimelinePanel.tsx`](../../src/components/TimelinePanel.tsx)

Stable output shape:

- capture state:
  - `isRecording`, `recordingTime`, `startRecording`, `stopRecording`
  - `isProcessingCapture`
  - `isBurstCapturing`, `burstCount`, `setBurstCount`, `captureBurst`
  - `isCountingDown`, `countdownSeconds`, `countdownRemaining`, `setCountdownSeconds`
  - `capturePhoto`
- timelapse state:
  - `isTimelapseCapturing`
  - `timelapseState`
  - `timelapseIntervalSeconds`, `setTimelapseIntervalSeconds`
  - `timelapseMaxShots`, `setTimelapseMaxShots`
  - `timelapseShotsCaptured`
  - `startTimelapseCapture`, `stopTimelapseCapture`
- presets and profiles:
  - `availableProfiles`, `selectedProfileId`, `setRecordingProfileId`
  - `availableCapturePresets`, `selectedCapturePresetId`, `applyCapturePreset`
  - `saveCurrentCapturePreset`, `deleteUserCapturePreset`
  - `stillImageFormat`, `setStillImageFormat`
- library and storage:
  - `mediaItems`, `refreshMediaItems`
  - `storageStats`
  - `importedMediaCapability`, `isImportingMedia`, `importMediaFromDisk`
  - `deleteMediaItem`, `clearMediaLibrary`, `resetMediaDatabase`
  - `error`

Required invariants:

- capture state flags must describe mutually coherent session state; avoid introducing overlapping booleans that can disagree with `timelapseState` or recording lifecycle.
- library mutations must continue to flow through persisted storage services rather than in-memory-only shortcuts.
- hidden-tab timelapse semantics remain part of this facade even if timer logic moves into a dedicated service.

## useTimelineController

Source: [`src/controllers/TimelineController.tsx`](../../src/controllers/TimelineController.tsx)

Public responsibility:

- own project-session lifecycle, autosave, project list refresh, and project package import/export
- expose playback transport, preview-source selection, editing commands, and export progress
- publish selection state, history state, and audio-preview state to the React layer

Protected consumers:

- [`src/components/TimelinePanel.tsx`](../../src/components/TimelinePanel.tsx)
- [`src/components/MonitoringOverviewPanel.tsx`](../../src/components/MonitoringOverviewPanel.tsx)
- [`src/components/layout/AppLayout.tsx`](../../src/components/layout/AppLayout.tsx)

Stable output shape:

- project/session state:
  - `project`, `projectList`, `isDirty`, `isLoading`
  - `refreshProjects`, `saveCurrentProject`, `renameProject`, `selectProject`, `deleteProject`
- playback and preview:
  - `transportState`, `isPlaying`, `clockSource`
  - `playPlayback`, `pausePlayback`, `stopPlayback`
  - `playheadMs`, `setPlayheadMs`
  - `previewMode`, `setPreviewMode`
  - `audioPreviewState`, `audioPreviewError`, `activeAudioNodeCount`
  - `compositionFrame`
- editing state:
  - `tracks`, `clips`
  - `selectedClip`, `selectedClipId`, `selectClip`
  - `selectedTrackId`, `selectedTrackLocked`, `selectTrack`
  - `zoomLevel`, `setZoomLevel`
  - editing commands such as `addMediaClip`, `moveSelectedClipBy`, `trimSelectedClipBy`, `splitSelectedClipAtPlayhead`, `duplicateSelectedClip`, `removeSelectedClip`, `rippleDeleteSelectedClip`, `insertGapAtPlayhead`, `closeSelectedTrackGaps`
  - track toggles `toggleTrackLocked`, `toggleTrackMuted`, `toggleTrackSolo`
  - `updateSelectedClipAudioSettings`, `updateSelectedClipAudioEnvelope`
- history/export/package:
  - `canUndo`, `canRedo`, `undo`, `redo`
  - `exportState`, `exportProgress`, `exportError`, `startExport`, `cancelExport`
  - `packageState`, `packageProgress`, `packageError`, `exportProjectPackage`, `importProjectPackage`, `cancelProjectPackage`
  - `error`

Required invariants:

- transport-facing fields must stay coherent with `transportState`; do not add parallel play/pause booleans.
- editing commands must continue to operate on persisted project state rather than detached view-local copies.
- export and package progress fields must remain explicit state machines, not ad hoc booleans plus nullable errors.
