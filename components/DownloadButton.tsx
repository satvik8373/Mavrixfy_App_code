/**
 * Download Button Component
 * 
 * Shows download/delete button for native/JioSaavn songs
 * Supports offline playback
 */

import React, { useState } from 'react';
import { Pressable, ActivityIndicator, StyleSheet, View, Alert, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useDownloads, useSongDownload } from '@/contexts/DownloadContext';
import { getBestAudioUrlWithQuality, type Song } from '@/lib/musicData';
import { logger } from '@/lib/logger';
import { formatBytes } from '@/lib/downloads/storagePolicy';
import { isYouTubeBackedSong } from '@/lib/downloads/sourceGuards';

function resolveSongAudioUrl(song: Song): string {
  if (song.audioUrl) return song.audioUrl;

  const bestDownloadUrl = getBestAudioUrlWithQuality(song.downloadUrl, "high");
  if (bestDownloadUrl) return bestDownloadUrl;
  
  // @ts-ignore
  const directCandidates = [song.url, song.uri, song.streamUrl, song.downloadUrl];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  // @ts-ignore
  const downloadUrlValue = song.downloadUrl;
  if (downloadUrlValue && typeof downloadUrlValue === 'object') {
    const nested = (downloadUrlValue as any).url || (downloadUrlValue as any).link;
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim();
    }
  }

  return '';
}

interface DownloadButtonProps {
  song: Song;
  size?: number;
  color?: string;
  onDownloadComplete?: (localUri: string) => void;
  onDownloadDeleted?: () => void;
  style?: any;
  showLabel?: boolean;
}

export default function DownloadButton({
  song,
  size = 24,
  color = Colors.text,
  onDownloadDeleted,
  style,
  showLabel = false,
}: DownloadButtonProps) {
  const { downloadSong, removeDownload } = useDownloads();
  const [isPreparing, setIsPreparing] = useState(false);
  const isYouTube = isYouTubeBackedSong(song);
  const download = useSongDownload(song.id);

  const isDownloaded = download?.status === 'completed';
  const isDownloading =
    isPreparing ||
    download?.status === 'downloading' ||
    download?.status === 'queued' ||
    download?.status === 'waiting_for_wifi' ||
    download?.status === 'waiting_for_charging';

  const progress = (download?.progress ?? 0) / 100;

  if (isYouTube) {
    return null;
  }

  async function handleDownload() {
    if (isDownloading) return;

    setIsPreparing(true);
    try {
      let sizeLabel = 'unknown size';
      let actualSize: number | null = null;
      
      const audioUrl = resolveSongAudioUrl(song);
      if (audioUrl) {
        try {
          const response = await fetch(audioUrl, { method: 'HEAD' });
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
            actualSize = parseInt(contentLength, 10);
            sizeLabel = formatBytes(actualSize);
          }
        } catch (err) {
          logger.warn('[DownloadButton] Failed to fetch download size:', err);
        }
      }

      if (!actualSize) {
        const estimatedBytes = (song.duration || 0) * 25_000;
        sizeLabel = estimatedBytes > 0 ? `~${formatBytes(estimatedBytes)}` : 'unknown size';
      }

      setIsPreparing(false);

      Alert.alert(
        'Download Song',
        `Download "${song.title}" for offline playback?\n\nSize: ${sizeLabel}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Download',
            onPress: async () => {
              try {
                const res = await downloadSong(song);
                if (!res.ok) {
                  Alert.alert('Download Failed', res.reason || 'Could not queue download');
                }
              } catch (err: any) {
                Alert.alert('Download Failed', err.message || 'An error occurred');
              }
            }
          }
        ]
      );
    } catch (err: any) {
      setIsPreparing(false);
      Alert.alert('Download Failed', err.message || 'An error occurred');
    }
  }

  async function handleDelete() {
    Alert.alert(
      'Delete Download',
      `Remove "${song.title}" from downloads?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await removeDownload(song.id);
            onDownloadDeleted?.();
          }
        }
      ]
    );
  }

  return (
    <Pressable
      onPress={isDownloaded ? handleDelete : handleDownload}
      disabled={isDownloading}
      style={({ pressed }) => [
        showLabel ? styles.rowButton : styles.button,
        pressed && styles.buttonPressed,
        style,
      ]}
    >
      <View style={showLabel ? styles.iconContainer : null}>
        {isDownloading ? (
          <View style={styles.progressContainer}>
            <ActivityIndicator size="small" color={Colors.primary} />
            {progress > 0 && (
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            )}
          </View>
        ) : (
          <Ionicons
            name={isDownloaded ? 'checkmark-circle' : 'download-outline'}
            size={size}
            color={isDownloaded ? Colors.primary : color}
          />
        )}
      </View>
      {showLabel && (
        <Text style={[styles.rowText, isDownloaded && styles.labelActive]}>
          {isDownloading
            ? isPreparing ? `Preparing...` : `Downloading...`
            : isDownloaded
            ? `Downloaded`
            : `Download`}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  iconContainer: {
    width: 32,
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
  },
  labelActive: {
    color: Colors.primary,
  },
  buttonPressed: {
    opacity: 0.6,
  },
  progressContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    position: 'absolute',
    bottom: -4,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 1,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 1,
  },
});
