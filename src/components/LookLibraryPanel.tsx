import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useRef, useState, type ChangeEvent } from 'react';
import { StudioDeckSection } from './StudioDeckSection';
import { StudioEmptyState } from './StudioEmptyState';
import type { LutDefinition } from '../types/color';
import type { LookPresetRecord } from '../types/lookPreset';

interface LookLibraryPanelProps {
  readonly activeLutDefinition: LutDefinition | null;
  readonly bundledLuts: readonly LutDefinition[];
  readonly importedLuts: readonly LutDefinition[];
  readonly isLutImporting: boolean;
  readonly isLutLoading: boolean;
  readonly isLookPresetSaving: boolean;
  readonly lookPresets: readonly LookPresetRecord[];
  readonly lutImportError: string | null;
  readonly lutIntensityControl: JSX.Element;
  readonly lutLoadError: string | null;
  readonly onApplyLookPreset: (presetId: string) => Promise<void>;
  readonly onDeleteImportedLut: (lutId: string) => Promise<void>;
  readonly onDeleteLookPreset: (presetId: string) => Promise<void>;
  readonly onImportLutFile: (file: File) => Promise<void>;
  readonly onLoadLut: (lutId: string | null) => Promise<void>;
  readonly onSaveLookPreset: (name: string) => Promise<void>;
}

function LibraryGroup({
  children,
  title,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}): JSX.Element {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: '18px',
        border: `1px solid ${isDark ? 'rgba(120, 173, 191, 0.16)' : 'rgba(15, 79, 99, 0.08)'}`,
        bgcolor: alpha(theme.palette.background.paper, isDark ? 0.3 : 0.46),
      }}
    >
      <Stack spacing={1.1}>
        <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
          {title}
        </Typography>
        {children}
      </Stack>
    </Box>
  );
}

function formatLutCategory(
  category: LutDefinition['category'],
): string | null {
  if (category === undefined) {
    return null;
  }

  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function LookLibraryPanel({
  activeLutDefinition,
  bundledLuts,
  importedLuts,
  isLutImporting,
  isLutLoading,
  isLookPresetSaving,
  lookPresets,
  lutImportError,
  lutIntensityControl,
  lutLoadError,
  onApplyLookPreset,
  onDeleteImportedLut,
  onDeleteLookPreset,
  onImportLutFile,
  onLoadLut,
  onSaveLookPreset,
}: LookLibraryPanelProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [presetName, setPresetName] = useState<string>('');
  const [presetError, setPresetError] = useState<string | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const selectedFile = event.target.files?.[0] ?? null;

    if (selectedFile === null) {
      return;
    }

    void onImportLutFile(selectedFile);
    event.target.value = '';
  }

  function handleSavePreset(): void {
    setPresetError(null);
    void onSaveLookPreset(presetName)
      .then((): void => {
        setPresetName('');
      })
      .catch((error: unknown): void => {
        setPresetError(
          error instanceof Error ? error.message : 'Failed to save the look preset.',
        );
      });
  }

  return (
    <StudioDeckSection
      kicker="Look"
      title="Look Library"
      icon={<TuneRoundedIcon fontSize="small" />}
      actions={
        <Stack direction="row" spacing={1} alignItems="center">
          {isLutLoading || isLutImporting || isLookPresetSaving ? (
            <CircularProgress size={18} />
          ) : null}
          <input
            ref={fileInputRef}
            accept=".cube"
            hidden
            onChange={handleFileChange}
            type="file"
          />
          <Button
            aria-label="Import LUT"
            color="inherit"
            onClick={(): void => fileInputRef.current?.click()}
            startIcon={<FileUploadRoundedIcon />}
            variant="outlined"
          >
            Import LUT
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          Build a reusable look system with bundled LUTs, imported LUTs, and saved grading presets.
        </Typography>

        <LibraryGroup title="Active Look">
          <Stack spacing={1}>
            <Button
              onClick={(): void => {
                void onLoadLut(null);
              }}
              variant={activeLutDefinition === null ? 'contained' : 'outlined'}
            >
              No LUT
            </Button>
            {activeLutDefinition !== null ? (
              <Box
                sx={{
                  p: 1.2,
                  borderRadius: '16px',
                  border: '1px solid rgba(15, 79, 99, 0.08)',
                }}
              >
                <Typography variant="subtitle2">{activeLutDefinition.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {activeLutDefinition.sourceType === 'imported' ? 'Imported LUT' : 'Bundled LUT'}
                </Typography>
                {activeLutDefinition.category !== undefined ? (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {formatLutCategory(activeLutDefinition.category)}
                  </Typography>
                ) : null}
                {activeLutDefinition.notes !== undefined ? (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {activeLutDefinition.notes}
                  </Typography>
                ) : null}
              </Box>
            ) : null}
            {lutIntensityControl}
            {lutImportError !== null ? (
              <Typography variant="caption" color="error.main">
                {lutImportError}
              </Typography>
            ) : null}
            {lutLoadError !== null ? (
              <Typography variant="caption" color="error.main">
                {lutLoadError}
              </Typography>
            ) : null}
          </Stack>
        </LibraryGroup>

        <LibraryGroup title="Imported LUTs">
          {importedLuts.length === 0 ? (
            <StudioEmptyState
              title="No Imported LUTs"
              body="Bring in custom .cube looks and they will appear here with removable library entries."
            />
          ) : (
            <Stack spacing={0.9}>
              {importedLuts.map((lut): JSX.Element => (
                <Stack
                  key={lut.id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  spacing={1}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {lut.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {lut.fileName ?? 'Imported LUT'}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <Button
                      aria-label={`Load imported LUT ${lut.label}`}
                      onClick={(): void => {
                        void onLoadLut(lut.id);
                      }}
                      size="small"
                      variant="outlined"
                    >
                      Load
                    </Button>
                    <Button
                      aria-label={`Remove imported LUT ${lut.label}`}
                      color="inherit"
                      onClick={(): void => {
                        void onDeleteImportedLut(lut.id);
                      }}
                      size="small"
                      startIcon={<DeleteOutlineRoundedIcon fontSize="small" />}
                      variant="outlined"
                    >
                      Remove
                    </Button>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </LibraryGroup>

        <LibraryGroup title="Bundled LUTs">
          <Stack spacing={0.9}>
            {bundledLuts.map((lut): JSX.Element => (
              <Stack
                key={lut.id}
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                spacing={1}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {lut.label}
                  </Typography>
                  {lut.description !== undefined ? (
                    <Typography variant="caption" color="text.secondary">
                      {lut.description}
                    </Typography>
                  ) : null}
                  {lut.category !== undefined || lut.tags !== undefined ? (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {[formatLutCategory(lut.category), ...(lut.tags ?? []).slice(0, 2)]
                        .filter((value): value is string => value !== null && value !== undefined)
                        .join(' · ')}
                    </Typography>
                  ) : null}
                </Box>
                <Button
                  aria-label={`Load bundled LUT ${lut.label}`}
                  onClick={(): void => {
                    void onLoadLut(lut.id);
                  }}
                  size="small"
                  variant="outlined"
                >
                  Load
                </Button>
              </Stack>
            ))}
          </Stack>
        </LibraryGroup>

        <LibraryGroup title="Saved Looks">
          <Stack spacing={1}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="Preset name"
                value={presetName}
                onChange={(event: ChangeEvent<HTMLInputElement>): void =>
                  setPresetName(event.target.value)
                }
              />
              <Button
                aria-label="Save look preset"
                onClick={handleSavePreset}
                startIcon={<SaveRoundedIcon />}
                variant="outlined"
              >
                Save
              </Button>
            </Stack>
            {presetError !== null ? (
              <Typography variant="caption" color="error.main">
                {presetError}
              </Typography>
            ) : null}
            {lookPresets.length === 0 ? (
              <StudioEmptyState
                title="No Saved Looks"
                body="Save your current grade, active LUT, mode, and framing as reusable looks."
              />
            ) : (
              <Stack spacing={0.9}>
                {lookPresets.map((preset): JSX.Element => (
                  <Stack
                    key={preset.id}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    spacing={1}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {preset.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Saved {new Date(preset.updatedAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5}>
                      <Button
                        aria-label={`Load look preset ${preset.name}`}
                        onClick={(): void => {
                          void onApplyLookPreset(preset.id);
                        }}
                        size="small"
                        variant="outlined"
                      >
                        Load
                      </Button>
                      <Button
                        aria-label={`Delete look preset ${preset.name}`}
                        color="inherit"
                        onClick={(): void => {
                          void onDeleteLookPreset(preset.id);
                        }}
                        size="small"
                        startIcon={<DeleteOutlineRoundedIcon fontSize="small" />}
                        variant="outlined"
                      >
                        Delete
                      </Button>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}
          </Stack>
        </LibraryGroup>
      </Stack>
    </StudioDeckSection>
  );
}
