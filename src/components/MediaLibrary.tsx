import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StudioDeckSection } from './StudioDeckSection';
import { StudioEmptyState } from './StudioEmptyState';
import { useRecordingController } from '../controllers/RecordingController';
import { getMediaById, type MediaItem } from '../services/MediaStorageService';

type MediaFilter = 'all' | MediaItem['type'];
type MediaSort = 'largest' | 'newest' | 'oldest';
const mediaPageSize = 50;

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function getFileExtension(item: MediaItem): string {
  if (item.mimeType === 'image/webp') {
    return 'webp';
  }

  if (item.mimeType === 'image/png') {
    return 'png';
  }

  if (item.mimeType.includes('webm')) {
    return 'webm';
  }

  return item.type === 'video' ? 'webm' : 'bin';
}

function sortMediaItems(items: readonly MediaItem[], sortBy: MediaSort): readonly MediaItem[] {
  if (sortBy === 'oldest') {
    return [...items].sort((left: MediaItem, right: MediaItem): number => left.timestamp - right.timestamp);
  }

  if (sortBy === 'largest') {
    return [...items].sort((left: MediaItem, right: MediaItem): number => right.sizeBytes - left.sizeBytes);
  }

  return [...items].sort((left: MediaItem, right: MediaItem): number => right.timestamp - left.timestamp);
}

export function MediaLibrary(): JSX.Element {
  const {
    clearMediaLibrary,
    deleteMediaItem,
    error,
    importedMediaCapability,
    importMediaFromDisk,
    isImportingMedia,
    mediaItems,
    resetMediaDatabase,
    storageStats,
  } = useRecordingController();
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [mediaPage, setMediaPage] = useState<number>(1);
  const [mediaSort, setMediaSort] = useState<MediaSort>('newest');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredMediaItems = useMemo<readonly MediaItem[]>(
    (): readonly MediaItem[] => {
      const nextItems =
        mediaFilter === 'all'
          ? mediaItems
          : mediaItems.filter((item: MediaItem): boolean => item.type === mediaFilter);

      return sortMediaItems(nextItems, mediaSort);
    },
    [mediaFilter, mediaItems, mediaSort],
  );
  const storageUsageRatio = useMemo<number | null>(
    (): number | null => {
      if (storageStats === null || storageStats.maxAllowedBytes === null) {
        return null;
      }

      return storageStats.usageBytes / storageStats.maxAllowedBytes;
    },
    [storageStats],
  );
  const unavailableLinkedItemCount = useMemo<number>(
    (): number =>
      mediaItems.filter(
        (item: MediaItem): boolean => item.storageKind === 'file-system-handle' && !item.isAvailable,
      ).length,
    [mediaItems],
  );
  const totalPages = Math.max(1, Math.ceil(filteredMediaItems.length / mediaPageSize));
  const pagedMediaItems = useMemo<readonly MediaItem[]>(
    (): readonly MediaItem[] => {
      const startIndex = (mediaPage - 1) * mediaPageSize;
      return filteredMediaItems.slice(startIndex, startIndex + mediaPageSize);
    },
    [filteredMediaItems, mediaPage],
  );
  const pageRangeLabel = useMemo<string>(() => {
    if (filteredMediaItems.length === 0) {
      return 'Showing 0 of 0';
    }

    const startItem = (mediaPage - 1) * mediaPageSize + 1;
    const endItem = Math.min(filteredMediaItems.length, mediaPage * mediaPageSize);

    return `Showing ${startItem}-${endItem} of ${filteredMediaItems.length}`;
  }, [filteredMediaItems.length, mediaPage]);
  const ingestModeSummary = importedMediaCapability.fileSystemAccessSupported
    ? 'Linked import mode available. Large media stays referenced on disk unless the browser must fall back to a stored copy.'
    : 'This browser uses copy-based import. Large local media will consume browser quota and should be kept small.';

  useEffect((): void => {
    setMediaPage(1);
  }, [mediaFilter, mediaSort]);

  useEffect((): void => {
    if (mediaPage > totalPages) {
      setMediaPage(totalPages);
    }
  }, [mediaPage, totalPages]);

  async function handleDownload(item: MediaItem): Promise<void> {
    const resolvedItem = await getMediaById(item.id);

    if (resolvedItem === null) {
      return;
    }

    const objectUrl = URL.createObjectURL(resolvedItem.blob);
    const linkElement = document.createElement('a');
    linkElement.href = objectUrl;
    linkElement.download = `${resolvedItem.name || `${resolvedItem.type}-${resolvedItem.id}.${getFileExtension(resolvedItem)}`}`;
    linkElement.style.display = 'none';
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);

    window.setTimeout((): void => {
      URL.revokeObjectURL(objectUrl);
    }, 0);
  }

  return (
    <Stack spacing={2}>
      <StudioDeckSection
        kicker="Archive"
        title="Media Library"
        icon={<VideoLibraryRoundedIcon fontSize="small" />}
        actions={
          <Stack direction="row" spacing={1}>
            {import.meta.env.DEV ? (
              <Button
                color="warning"
                onClick={(): void => void resetMediaDatabase()}
                startIcon={<WarningAmberRoundedIcon />}
                variant="outlined"
              >
                Reset DB
              </Button>
            ) : null}
            <Button
              color="primary"
              disabled={isImportingMedia}
              onClick={(): void => {
                if (importedMediaCapability.fileSystemAccessSupported) {
                  void importMediaFromDisk();
                  return;
                }

                fileInputRef.current?.click();
              }}
              startIcon={<UploadFileRoundedIcon />}
              variant="contained"
            >
              {isImportingMedia ? 'Importing…' : 'Import Media'}
            </Button>
            <Button
              color="inherit"
              disabled={mediaItems.length === 0}
              onClick={(): void => void clearMediaLibrary()}
              startIcon={<DeleteSweepRoundedIcon />}
              variant="outlined"
            >
              Clear All
            </Button>
          </Stack>
        }
      >
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            Review, sort, import, download, or clear captured and linked media.
          </Typography>
          <input
            ref={fileInputRef}
            accept="image/*,video/*"
            hidden
            multiple
            type="file"
            onChange={(event): void => {
              const nextFiles = Array.from(event.target.files ?? []);

              if (nextFiles.length > 0) {
                void importMediaFromDisk(nextFiles);
              }

              event.target.value = '';
            }}
          />
          {error !== null ? <Alert severity="warning">{error}</Alert> : null}
          <Alert severity={importedMediaCapability.fileSystemAccessSupported ? 'info' : 'warning'}>
            {ingestModeSummary}
          </Alert>
          {storageUsageRatio !== null && storageUsageRatio >= 0.85 ? (
            <Alert severity="warning">
              Browser storage is near its managed budget. Prefer linked imports and avoid copying
              large local media into browser storage.
            </Alert>
          ) : null}
          {unavailableLinkedItemCount > 0 ? (
            <Alert severity="warning">
              {unavailableLinkedItemCount} linked file{unavailableLinkedItemCount === 1 ? '' : 's'} currently unavailable. Reconnect those files on disk before relying on them in the timeline.
            </Alert>
          ) : null}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
              gap: 1,
            }}
          >
            <Box
              sx={{
                p: 1.2,
                borderRadius: 3,
                border: '1px solid rgba(120, 173, 191, 0.16)',
                background:
                  'linear-gradient(180deg, rgba(22, 51, 62, 0.88) 0%, rgba(12, 31, 39, 0.8) 100%)',
              }}
            >
              <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                Items
              </Typography>
              <Typography variant="body2">{mediaItems.length}</Typography>
            </Box>
            <Box
              sx={{
                p: 1.2,
                borderRadius: 3,
                border: '1px solid rgba(120, 173, 191, 0.16)',
                background:
                  'linear-gradient(180deg, rgba(22, 51, 62, 0.88) 0%, rgba(12, 31, 39, 0.8) 100%)',
              }}
            >
              <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                Visible
              </Typography>
              <Typography variant="body2">{filteredMediaItems.length}</Typography>
            </Box>
            <Box
              sx={{
                p: 1.2,
                borderRadius: 3,
                border: '1px solid rgba(120, 173, 191, 0.16)',
                background:
                  'linear-gradient(180deg, rgba(22, 51, 62, 0.88) 0%, rgba(12, 31, 39, 0.8) 100%)',
              }}
            >
              <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                Storage
              </Typography>
              <Typography variant="body2">
                {storageStats === null
                  ? 'Scanning'
                  : `${(storageStats.usageBytes / (1024 * 1024)).toFixed(1)} MB`}
              </Typography>
            </Box>
            <Box
              sx={{
                p: 1.2,
                borderRadius: 3,
                border: '1px solid rgba(120, 173, 191, 0.16)',
                background:
                  'linear-gradient(180deg, rgba(22, 51, 62, 0.88) 0%, rgba(12, 31, 39, 0.8) 100%)',
              }}
            >
              <Typography variant="overline" sx={{ color: 'secondary.dark' }}>
                Import Mode
              </Typography>
              <Typography variant="body2">
                {importedMediaCapability.fileSystemAccessSupported ? 'Linked files' : 'Stored copies'}
              </Typography>
            </Box>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <FormControl fullWidth size="small">
              <InputLabel id="media-filter-label">Filter</InputLabel>
              <Select
                label="Filter"
                labelId="media-filter-label"
                value={mediaFilter}
                onChange={(event: SelectChangeEvent<MediaFilter>): void =>
                  setMediaFilter(event.target.value as MediaFilter)
                }
              >
                <MenuItem value="all">All Media</MenuItem>
                <MenuItem value="video">Video</MenuItem>
                <MenuItem value="image">Image</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel id="media-sort-label">Sort</InputLabel>
              <Select
                label="Sort"
                labelId="media-sort-label"
                value={mediaSort}
                onChange={(event: SelectChangeEvent<MediaSort>): void =>
                  setMediaSort(event.target.value as MediaSort)
                }
              >
                <MenuItem value="newest">Newest</MenuItem>
                <MenuItem value="oldest">Oldest</MenuItem>
                <MenuItem value="largest">Largest</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          {storageStats !== null ? (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
            >
              <Typography variant="caption" color="text.secondary">
                {storageStats.itemCount} items, {(storageStats.usageBytes / (1024 * 1024)).toFixed(1)} MB used
                {storageStats.maxAllowedBytes !== null
                  ? ` of ${(storageStats.maxAllowedBytes / (1024 * 1024)).toFixed(1)} MB budget`
                  : ''}
                {storageStats.handleBackedItemCount > 0
                  ? ` • ${storageStats.handleBackedItemCount} linked file${
                      storageStats.handleBackedItemCount === 1 ? '' : 's'
                    } (${(storageStats.referencedBytes / (1024 * 1024)).toFixed(1)} MB external)`
                  : ''}
                {storageStats.copiedItemCount > 0
                  ? ` • ${storageStats.copiedItemCount} stored cop${
                      storageStats.copiedItemCount === 1 ? 'y' : 'ies'
                    } inside browser storage`
                  : ''}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {pageRangeLabel}
              </Typography>
            </Stack>
          ) : null}
          {filteredMediaItems.length === 0 ? (
            <StudioEmptyState
              title="No media in view"
              body="Record footage or capture stills to build your library, then filter and sort them here."
            />
          ) : null}
          <List disablePadding>
        {pagedMediaItems.map(
          (item: MediaItem): JSX.Element => (
            <ListItem
              key={item.id}
              disableGutters
              secondaryAction={
                <Stack direction="row" spacing={1}>
                  <IconButton
                    aria-label={`Download ${item.name}`}
                    edge="end"
                    disabled={!item.isAvailable}
                    onClick={(): void => void handleDownload(item)}
                  >
                    <DownloadRoundedIcon />
                  </IconButton>
                  <IconButton
                    aria-label={`Delete ${item.name}`}
                    edge="end"
                    onClick={(): void => void deleteMediaItem(item.id)}
                  >
                    <DeleteRoundedIcon />
                  </IconButton>
                </Stack>
              }
              sx={{
                alignItems: 'flex-start',
                borderBottom: '1px solid rgba(120, 173, 191, 0.12)',
                py: 1.5,
                px: 1.25,
                borderRadius: 3,
                mb: 1,
                background:
                  'linear-gradient(180deg, rgba(22, 51, 62, 0.88) 0%, rgba(12, 31, 39, 0.8) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
              }}
            >
              <ListItemAvatar>
                {item.thumbnail === undefined ? (
                  <Avatar variant="rounded">{item.type === 'video' ? 'V' : 'I'}</Avatar>
                ) : (
                  <Avatar src={item.thumbnail} variant="rounded" />
                )}
              </ListItemAvatar>
              <ListItemText
                primary={item.name}
                primaryTypographyProps={{ noWrap: true }}
                secondaryTypographyProps={{ component: 'div' }}
                secondary={
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatTimestamp(item.timestamp)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(item.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.captureMode}
                      {item.width !== undefined && item.height !== undefined
                        ? ` • ${item.width} x ${item.height}`
                        : ''}
                      {item.durationMs !== undefined
                        ? ` • ${(item.durationMs / 1000).toFixed(1)}s`
                        : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.origin === 'imported' ? 'Imported' : 'Captured'}
                      {' • '}
                      {item.storageKind === 'file-system-handle' ? 'Linked file' : 'Stored copy'}
                      {!item.isAvailable ? ' • unavailable' : ''}
                    </Typography>
                  </Stack>
                }
                sx={{ pr: 10 }}
              />
              {item.storageKind === 'file-system-handle' ? (
                <Box
                  sx={{
                    alignSelf: 'center',
                    color: item.isAvailable ? 'secondary.main' : 'warning.main',
                    mr: 1,
                  }}
                >
                  <LinkRoundedIcon fontSize="small" />
                </Box>
              ) : null}
            </ListItem>
          ),
        )}
          </List>
          {filteredMediaItems.length > mediaPageSize ? (
            <Stack
              direction="row"
              spacing={1}
              justifyContent="space-between"
              alignItems="center"
              sx={{ pt: 0.5 }}
            >
              <Typography variant="caption" color="text.secondary">
                Page {mediaPage} of {totalPages}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  aria-label="Previous media page"
                  disabled={mediaPage <= 1}
                  onClick={(): void => setMediaPage((currentPage) => Math.max(1, currentPage - 1))}
                  size="small"
                  variant="outlined"
                >
                  Previous
                </Button>
                <Button
                  aria-label="Next media page"
                  disabled={mediaPage >= totalPages}
                  onClick={(): void =>
                    setMediaPage((currentPage) => Math.min(totalPages, currentPage + 1))
                  }
                  size="small"
                  variant="outlined"
                >
                  Next
                </Button>
              </Stack>
            </Stack>
          ) : null}
        </Stack>
      </StudioDeckSection>
    </Stack>
  );
}
