import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import * as Animated from "@/lib/nativeAnimated";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  ToastAndroid,
  ActivityIndicator,
  AppState,
  InteractionManager,
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  useWindowDimensions,
  ViewStyle
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { AD_UNITS } from "@/constants/admob";
import { safeGoBack } from "@/utils/navigation";
import { usePlayerActions, usePlayerProgress, usePlayerRow } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/lib/playbackEngine";
import { globalPlayerDetailsVisibleRef } from "@/lib/playerModalRef";
import { convertJioSaavnSong, formatDuration, getBestImageUrl, Song } from "@/lib/musicData";
import { getRecentlyPlayed, getUserPlaylists, getSettings, getYouTubePlaybackQuality } from "@/lib/storage";
import { PingPongScroll } from "@/components/PingPongScroll";
import { logger } from "@/lib/logger";
import { getDevicePerformanceProfile } from "@/lib/devicePerformance";
import {
  createSpotifyColorTheme,
  extractDominantColor,
  getImmediateArtworkColor,
  preloadDominantColors,
} from "@/lib/colorExtractor";
import EqualizerBars from "@/components/EqualizerBars";
import DownloadButton from "@/components/DownloadButton";
import { getArtistDetails, JioSaavnArtist, searchArtists } from "@/lib/artistService";
import { isFollowingArtist, toggleFollowArtist } from "@/lib/followedArtists";
import { mapFilter } from "@/lib/arrayUtils";
import { globalQueueSheetRef } from "@/lib/queueRef";
import { getGoogleMobileAdsModule, type GoogleNativeAd } from "@/lib/googleMobileAds";
import { getYouTubeMusicVisualVideoId } from "@/lib/youtubeMusicService";
import YoutubePlayer from "react-native-youtube-iframe";

const getCurrentTimestamp = () => Date.now();
const PLAYER_DETAIL_BOTTOM_OVERLAY_PADDING = 136;
const PLAYER_AD_COVER_COOLDOWN_MS = 8 * 60 * 1000;
const PLAYER_AD_COVER_COOLDOWN_SONGS = 4;
const PLAYER_PRIMARY_DISMISS_START_PX = 8;
const PLAYER_PRIMARY_DISMISS_CLOSE_PX = 62;
const PLAYER_PRIMARY_DISMISS_FAST_VELOCITY = 650;
const PLAYER_PRIMARY_DISMISS_FAIL_X_PX = 34;
const PLAYER_DISMISS_TOP_OFFSET_PX = 24;
const PLAYER_PRIMARY_DISMISS_MAX_DRAG_RATIO = 0.58;
const PLAYER_PRIMARY_DISMISS_SPRING = {
  damping: 24,
  mass: 0.9,
  stiffness: 270,
};
const YOUTUBE_PLAYER_REFERRER_URL = "https://mavrixfy.site/";
const BACKGROUND_YOUTUBE_CHROME_CROP_PX = 260;
const BACKGROUND_YOUTUBE_CHROME_CROP_TOTAL_PX = BACKGROUND_YOUTUBE_CHROME_CROP_PX * 2;
const BACKGROUND_YOUTUBE_CROP_SCRIPT = `
(function () {
  function applyAmbientCrop() {
    var head = document.head || document.getElementsByTagName("head")[0];
    if (!head) {
      setTimeout(applyAmbientCrop, 16);
      return;
    }

    var viewportHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0, 220);
    var videoHeight = Math.ceil(viewportHeight + ${BACKGROUND_YOUTUBE_CHROME_CROP_TOTAL_PX});
    var videoWidth = Math.ceil(videoHeight * 16 / 9);
    var style = document.getElementById("mavrixfy-ambient-youtube-crop");
    if (!style) {
      style = document.createElement("style");
      style.id = "mavrixfy-ambient-youtube-crop";
      head.appendChild(style);
    }
    style.textContent = [
      "html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: ${Colors.background}; }",
      ".container { position: relative !important; width: 100% !important; height: 100vh !important; padding-bottom: 0 !important; overflow: hidden !important; background: ${Colors.background}; }",
      "#player, .container iframe { position: absolute !important; top: -${BACKGROUND_YOUTUBE_CHROME_CROP_PX}px !important; left: 50% !important; width: " + videoWidth + "px !important; height: " + videoHeight + "px !important; max-width: none !important; max-height: none !important; transform: translateX(-50%) !important; border: 0 !important; pointer-events: none !important; }"
    ].join("\\n");

    document.documentElement.style.overflow = "hidden";
    if (document.body) {
      document.body.style.overflow = "hidden";
      document.body.style.background = "${Colors.background}";
    }
  }

  applyAmbientCrop();
  setTimeout(applyAmbientCrop, 250);
  setTimeout(applyAmbientCrop, 1000);
  window.addEventListener("resize", applyAmbientCrop);
})();
true;
`;

function getYouTubeVideoIdFromSong(song: Song | null | undefined): string {
  if (!song) return "";
  const source = song as Song & {
    videoId?: unknown;
    video_id?: unknown;
    youtubeId?: unknown;
    youtube_id?: unknown;
    youtubeVideoId?: unknown;
    youtubeVisualVideoId?: unknown;
    url?: unknown;
    watchUrl?: unknown;
    videoUrl?: unknown;
  };
  const candidates = [
    source.youtubeVisualVideoId,
    source.youtubeVideoId,
    source.videoId,
    source.video_id,
    source.youtubeId,
    source.youtube_id,
    String(source.id || "").replace(/^youtube_/, ""),
  ];

  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  }

  const watchUrl = String(source.url || source.watchUrl || source.videoUrl || "").trim();
  const match = watchUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return match?.[1] || match?.[2] || "";
}

function hexToRgba(color: string, alpha: number): string {
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const hex = color.replace("#", "").trim();
  if (hex.length === 3) {
    const red = Number.parseInt(hex[0] + hex[0], 16);
    const green = Number.parseInt(hex[1] + hex[1], 16);
    const blue = Number.parseInt(hex[2] + hex[2], 16);
    if (!Number.isNaN(red) && !Number.isNaN(green) && !Number.isNaN(blue)) {
      return `rgba(${red},${green},${blue},${safeAlpha})`;
    }
  }
  if (hex.length === 6) {
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    if (!Number.isNaN(red) && !Number.isNaN(green) && !Number.isNaN(blue)) {
      return `rgba(${red},${green},${blue},${safeAlpha})`;
    }
  }
  return `rgba(255,255,255,${safeAlpha})`;
}

function getSeededFraction(seed: number): number {
  const safeSeed = seed >>> 0;
  return (safeSeed % 1000003) / 1000003;
}

function hashArtworkKey(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mapSeededRange(seed: number, min: number, max: number): number {
  return min + (max - min) * getSeededFraction(seed);
}

function getArtworkCardDecor(seedKey: string) {
  const baseSeed = hashArtworkKey(seedKey);
  const rotateDeg = mapSeededRange(baseSeed, -5.4, 5.4);
  const borderAlpha = mapSeededRange(Math.imul(baseSeed, 48271) + 7, 0.2, 0.36);
  return {
    rotateDeg,
    borderAlpha,
  };
}

const AnimatedSongFlatList = Animated.createAnimatedComponent(
  FlatList as React.ComponentType<any>
);

type SmoothControlButtonProps = {
  children: React.ReactNode;
  onPress?: () => void;
  onPressIn?: (event: GestureResponderEvent) => void;
  onPressOut?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  hitSlop?: React.ComponentProps<typeof Pressable>["hitSlop"];
  disabled?: boolean;
};

function SmoothControlButton({
  children,
  onPress,
  onPressIn,
  onPressOut,
  style,
  hitSlop,
  disabled,
}: SmoothControlButtonProps) {
  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      onPressIn?.(event);
    },
    [onPressIn]
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      onPressOut?.(event);
    },
    [onPressOut]
  );

  return (
    <Pressable
      android_disableSound
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={({ pressed }) => [style, pressed && styles.quickButtonPressed]}
    >
      {children}
    </Pressable>
  );
}

type CinematicGradientColors = readonly [string, string, string, string];
type ArtworkQueueItem = {
  song: Song;
  artworkKey: string;
};

function areGradientColorsEqual(a: CinematicGradientColors, b: CinematicGradientColors): boolean {
  return a.length === b.length && a.every((color, index) => color === b[index]);
}

const CinematicPlayerBackground = memo(function CinematicPlayerBackground({
  colors,
  coverUrl,
}: {
  colors: CinematicGradientColors;
  coverUrl: string;
}) {
  const fadeInRef = useRef<Animated.Value | null>(null);
  if (fadeInRef.current === null) fadeInRef.current = new Animated.Value(1);
  const fadeIn = fadeInRef.current;
  const artworkUri = coverUrl.trim();
  const [layers, setLayers] = useState<{
    current: CinematicGradientColors;
    previous: CinematicGradientColors | null;
  }>({
    current: colors,
    previous: null,
  });

  // react-doctor-disable-next-line react-doctor/no-event-handler -- imperative iframe seek sync must follow external playback position updates.
  useEffect(() => {
    setLayers((previousLayers) => {
      if (areGradientColorsEqual(previousLayers.current, colors)) {
        return previousLayers;
      }
      fadeIn.stopAnimation();
      fadeIn.setValue(0.78);
      return {
        current: colors,
        previous: previousLayers.current,
      };
    });

    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
      isInteraction: false,
    }).start(({ finished }) => {
      if (!finished) return;
      setLayers((previousLayers) => ({ current: previousLayers.current, previous: null }));
    });
  }, [colors, fadeIn]);

  return (
    <View pointerEvents="none" style={styles.backgroundLayer}>
      {artworkUri ? (
        <Image
          recyclingKey={`player-bg-${artworkUri}`}
          source={{ uri: artworkUri }}
          style={styles.backgroundArtworkImage}
          contentFit="cover"
          blurRadius={42}
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : null}
      {layers.previous ? (
        <LinearGradient
          colors={layers.previous}
          locations={[0, 0.34, 0.72, 1]}
          style={[
            StyleSheet.absoluteFillObject,
            styles.backgroundColorWash,
          ]}
        />
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fadeIn }]}>
        <LinearGradient
          colors={layers.current}
          locations={[0, 0.34, 0.72, 1]}
          style={[
            StyleSheet.absoluteFillObject,
            styles.backgroundColorWash,
          ]}
        />
      </Animated.View>
      <LinearGradient
        colors={["rgba(7,10,16,0.28)", "rgba(7,10,16,0.62)", "rgba(7,10,16,0.9)", "#070A10"]}
        locations={[0, 0.5, 0.86, 1]}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
});

const StableArtworkImage = memo(function StableArtworkImage({
  uri,
  recyclingKey,
  priority,
}: {
  uri: string;
  recyclingKey: string;
  priority: "high" | "normal";
}) {
  const initialUriRef = useRef(uri);
  const [visibleUri, setVisibleUri] = useState(initialUriRef.current);
  const loadingUri = uri === visibleUri ? null : uri;
  const incomingOpacityRef = useRef<Animated.Value | null>(null);
  if (incomingOpacityRef.current === null) incomingOpacityRef.current = new Animated.Value(1);
  const incomingOpacity = incomingOpacityRef.current;

  useEffect(() => {
    if (!loadingUri) {
      incomingOpacity.setValue(1);
      return;
    }

    incomingOpacity.stopAnimation();
    incomingOpacity.setValue(0);
  }, [incomingOpacity, loadingUri]);

  const handleIncomingLoad = useCallback(() => {
    Animated.timing(incomingOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
      isInteraction: false,
    }).start(({ finished }) => {
      if (!finished) return;
      setVisibleUri(uri);
    });
  }, [incomingOpacity, uri]);

  const handleIncomingError = useCallback(() => {
    incomingOpacity.setValue(1);
    setVisibleUri(uri);
  }, [incomingOpacity, uri]);

  return (
    <View style={styles.albumArtLayer}>
      <Image
        recyclingKey={`visible-${recyclingKey}-${visibleUri}`}
        source={{ uri: visibleUri }}
        style={styles.albumArt}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority={priority}
        transition={0}
      />
      {loadingUri ? (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: incomingOpacity }]}>
          <Image
            recyclingKey={`incoming-${recyclingKey}-${loadingUri}`}
            source={{ uri: loadingUri }}
            style={styles.albumArt}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority={priority}
            transition={0}
            onLoad={handleIncomingLoad}
            onError={handleIncomingError}
          />
        </Animated.View>
      ) : null}
    </View>
  );
});

async function getVideoBackgroundQuality() {
  try {
    const settings = await getSettings();
    return settings.videoBackgroundQuality;
  } catch (e) {
    logger.error("[Player] Failed to determine video background quality", e);
  }
  return "auto";
}

type VisibleYoutubeVideoProps = {
  song: Song;
  isPlaying: boolean;
  width: number;
  height: number;
};

const VisibleYoutubeVideo = memo(function VisibleYoutubeVideo({
  song,
  isPlaying,
  width,
  height,
}: VisibleYoutubeVideoProps) {
  const { positionMillis } = usePlayerProgress();
  const initialVideoId = useMemo(() => getYouTubeVideoIdFromSong(song), [song]);
  const [videoId, setVideoId] = useState(initialVideoId);
  const playerRef = useRef<any>(null);
  const initialPositionSeconds = Math.max(0, Math.floor(positionMillis / 1000));
  const latestPositionSecondsRef = useRef(initialPositionSeconds);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const mountedRef = useRef(false);
  const coverUri = useMemo(() => song.coverUrl?.trim() || "", [song.coverUrl]);

  // Track mount state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // react-doctor-disable-next-line react-doctor/no-cascading-set-state -- video id changes reset iframe readiness/error state together.
  useEffect(() => {
    setVideoId(initialVideoId);
    // Reset ready state when video ID changes to ensure proper initialization
    setIsReady(false);
    setHasError(false);
  }, [initialVideoId]);

  useEffect(() => {
    if (!song?.id || song.source !== "youtube") return;

    let cancelled = false;
    void getYouTubeMusicVisualVideoId(song)
      .then((visualVideoId) => {
        if (cancelled || !visualVideoId) return;
        setVideoId((current) => (current === visualVideoId ? current : visualVideoId));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [song]);

  const lastPositionRef = useRef(initialPositionSeconds);

  useEffect(() => {
    const targetSeconds = Math.max(0, Math.floor(positionMillis / 1000));
    latestPositionSecondsRef.current = targetSeconds;
    // react-doctor-disable-next-line react-doctor/no-event-handler -- imperative iframe seek sync must follow external playback position updates.
    if (isReady && Math.abs(targetSeconds - lastPositionRef.current) > 2) {
      playerRef.current?.seekTo?.(targetSeconds, true);
    }
    lastPositionRef.current = targetSeconds;
  }, [positionMillis, isReady]);

  // react-doctor-disable-next-line react-doctor/no-derived-state-effect -- iframe readiness/error are imperative player state, not render-derived values.
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-chain-state-updates -- both flags reset together when a new resolved video id loads.
    setIsReady(false);
    // react-doctor-disable-next-line react-doctor/no-chain-state-updates -- both flags reset together when a new resolved video id loads.
    setHasError(false);
  }, [videoId]);

  const handleReady = useCallback(() => {
    if (!mountedRef.current) return;
    setIsReady(true);
    setHasError(false);

    // Set requested quality for YouTube detail/backdrop playback.
    if (playerRef.current) {
      void getVideoBackgroundQuality().then((quality) => {
        try {
          const ytQuality = getYouTubePlaybackQuality(quality);
          playerRef.current.setPlaybackQuality?.(ytQuality);
          logger.debug("[YouTube Detail] Set playback quality to", { ytQuality });
        } catch (error) {
          logger.warn('[YouTube Detail] Failed to set quality:', error);
        }
      });
    }

    const targetSeconds = latestPositionSecondsRef.current;
    if (targetSeconds <= 0) return;

    setTimeout(() => {
      if (mountedRef.current) {
        playerRef.current?.seekTo?.(targetSeconds, true);
      }
    }, 250);
  }, []);

  const handleError = useCallback(() => {
    if (!mountedRef.current) return;
    setHasError(true);
    setIsReady(false);
  }, []);

  const youtubeWebViewProps = useMemo(() => ({
    javaScriptEnabled: true,
    domStorageEnabled: true,
    thirdPartyCookiesEnabled: true,
    setSupportMultipleWindows: false,
    allowsFullscreenVideo: false,
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
    scrollEnabled: false,
    overScrollMode: "never" as const,
    androidLayerType: "hardware" as const,
  }), []);

  return (
    <View style={styles.youtubeDetailPlayer}>
      {coverUri ? (
        <Image
          source={{ uri: coverUri }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          blurRadius={Platform.OS === "android" ? 0 : 12}
          transition={0}
          priority="high"
          cachePolicy="memory-disk"
        />
      ) : null}
      <View style={styles.youtubeDetailShade} />
      {videoId && !hasError ? (
        <View pointerEvents="none" style={styles.youtubeDetailIframe}>
          <YoutubePlayer
            key={videoId}
            ref={playerRef}
            height={height}
            width={width}
            play={isPlaying}
            mute
            videoId={videoId}
            onReady={handleReady}
            onError={handleError}
            forceAndroidAutoplay
            useLocalHTML
            baseUrlOverride={YOUTUBE_PLAYER_REFERRER_URL}
            initialPlayerParams={{
              controls: false,
              modestbranding: true,
              rel: false,
              preventFullScreen: true,
              showClosedCaptions: false,
              iv_load_policy: 3,
              start: initialPositionSeconds,
              disablekb: true,
              fs: false,
              playsinline: true,
              cc_load_policy: 0,
              enablejsapi: 1,
              origin: 'https://www.youtube.com',
            }}
            webViewProps={youtubeWebViewProps}
          />
        </View>
      ) : null}
      {!isReady && !hasError ? (
        <View pointerEvents="none" style={styles.youtubeDetailLoading}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      ) : null}
      {hasError ? (
        <View pointerEvents="none" style={styles.youtubeDetailLoading}>
          <Ionicons name="logo-youtube" size={30} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}, (prevProps, nextProps) => {
  // Always allow re-render when song changes (especially on first load)
  if (prevProps.song.id !== nextProps.song.id) {
    return false; // Allow re-render
  }
  
  return (
    prevProps.isPlaying === nextProps.isPlaying &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height
  );
});

VisibleYoutubeVideo.displayName = "VisibleYoutubeVideo";

type BackgroundYoutubeVideoProps = {
  videoId: string;
  isPlaying: boolean;
  positionMillis: number;
  containerHeight: number;
};

const BackgroundYoutubeVideo = memo(function BackgroundYoutubeVideo({
  videoId,
  isPlaying,
  positionMillis,
  containerHeight,
}: BackgroundYoutubeVideoProps) {
  const { width: winW } = useWindowDimensions();
  const playerRef = useRef<any>(null);
  const initialPositionSeconds = Math.max(0, Math.floor(positionMillis / 1000));
  const lastPositionRef = useRef(initialPositionSeconds);
  const [playerReady, setPlayerReady] = useState(false);
  const [videoVisible, setVideoVisible] = useState(false);

  const onReady = useCallback(() => {
    setPlayerReady(true);
    playerRef.current?.mute?.();
    void getVideoBackgroundQuality().then((quality) => {
      playerRef.current?.setPlaybackQuality?.(getYouTubePlaybackQuality(quality));
    });
  }, []);

  const handleBackgroundStateChange = useCallback((state: string) => {
    setVideoVisible(state === "playing");
  }, []);

  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler -- imperative iframe mute sync must follow readiness/playback updates.
    if (playerReady) {
      playerRef.current?.mute?.();
    }
  }, [playerReady, isPlaying]);

  useEffect(() => {
    const targetSeconds = Math.max(0, Math.floor(positionMillis / 1000));
    // react-doctor-disable-next-line react-doctor/no-event-handler -- imperative iframe seek sync must follow external playback position updates.
    if (playerReady && Math.abs(targetSeconds - lastPositionRef.current) > 10) {
      playerRef.current?.seekTo?.(targetSeconds, true);
    }
    lastPositionRef.current = targetSeconds;
  }, [positionMillis, playerReady]);

  const dimensions = useMemo(() => {
    return {
      frameW: Math.max(winW, 220),
      frameH: Math.max(containerHeight, 220),
    };
  }, [winW, containerHeight]);

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        { overflow: "hidden", backgroundColor: Colors.background },
      ]}
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: dimensions.frameW,
          height: dimensions.frameH,
          opacity: videoVisible ? 1 : 0,
        }}
      >
        <YoutubePlayer
          key={videoId}
          ref={playerRef}
          height={dimensions.frameH}
          width={dimensions.frameW}
          play={isPlaying}
          mute={true}
          volume={0}
          videoId={videoId}
          onReady={onReady}
          onChangeState={handleBackgroundStateChange}
          forceAndroidAutoplay
          useLocalHTML
          baseUrlOverride={YOUTUBE_PLAYER_REFERRER_URL}
          initialPlayerParams={{
            controls: false,
            modestbranding: true,
            rel: false,
            preventFullScreen: true,
            showClosedCaptions: false,
            iv_load_policy: 3,
            start: initialPositionSeconds,
            disablekb: true,
            fs: false,
            playsinline: true,
            cc_load_policy: 0,
            enablejsapi: 1,
          }}
          webViewProps={{
            javaScriptEnabled: true,
            domStorageEnabled: true,
            thirdPartyCookiesEnabled: true,
            injectedJavaScriptBeforeContentLoaded: BACKGROUND_YOUTUBE_CROP_SCRIPT,
            injectedJavaScript: BACKGROUND_YOUTUBE_CROP_SCRIPT,
            setSupportMultipleWindows: false,
            allowsFullscreenVideo: false,
            allowsInlineMediaPlayback: true,
            mediaPlaybackRequiresUserAction: false,
            androidLayerType: "hardware",
            incognito: true,
          }}
        />
      </View>
      {/* Subtle top fade - keeps status bar area clean */}
      <LinearGradient
        colors={topGradientColors}
        locations={topGradientLocations}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {/* Bottom gradient fade - starts earlier but more subtle */}
      <LinearGradient
        colors={bottomGradientColors}
        locations={bottomGradientLocations}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {/* Light scrim for overall text readability */}
      <View
        style={scrimStyle}
      />
    </View>
  );
}, (prevProps, nextProps) => {
  if (prevProps.videoId !== nextProps.videoId) return false;
  if (prevProps.isPlaying !== nextProps.isPlaying) return false;
  if (prevProps.containerHeight !== nextProps.containerHeight) return false;
  
  const diff = Math.abs(prevProps.positionMillis - nextProps.positionMillis);
  if (diff >= 10000) {
    return false;
  }
  
  return true;
});
BackgroundYoutubeVideo.displayName = "BackgroundYoutubeVideo";

// Pre-define gradient colors and styles outside component to avoid recreation on every render
const topGradientColors = ["rgba(7,10,16,0.3)", "rgba(7,10,16,0.1)", "transparent"] as const;
const topGradientLocations = [0, 0.06, 0.15] as const;
const bottomGradientColors = [
  "transparent",
  "rgba(7,10,16,0.08)",
  "rgba(7,10,16,0.18)",
  "rgba(7,10,16,0.35)",
  "rgba(7,10,16,0.58)",
  "rgba(7,10,16,0.82)",
  Colors.background
] as const;
const bottomGradientLocations = [0.15, 0.3, 0.45, 0.6, 0.75, 0.88, 1] as const;
const scrimStyle = [
  StyleSheet.absoluteFillObject,
  { backgroundColor: "rgba(7,10,16,0.06)" },
];



function PlayerPlayButton({
  isPlayingOverride,
  isLoadingOverride,
  buttonSize,
  iconSize,
  onAccentColor,
  onPress,
}: {
  isPlayingOverride?: boolean;
  isLoadingOverride?: boolean;
  buttonSize: number;
  iconSize: number;
  onAccentColor: string;
  onPress: () => void;
}) {
  const playbackState = usePlaybackPlayState();
  const isPlaying = isPlayingOverride ?? playbackState.isPlaying;
  const isLoading = isLoadingOverride ?? (playbackState.isBuffering || playbackState.isLoading);
  const [showSpinner, setShowSpinner] = useState(false);

  if (!isLoading && showSpinner) {
    setShowSpinner(false);
  }

  useEffect(() => {
    if (!isLoading) return;

    const timer = setTimeout(() => {
      setShowSpinner(true);
    }, 180);

    return () => clearTimeout(timer);
  }, [isLoading]);

  return (
    <SmoothControlButton
      onPress={onPress}
      style={[
        styles.playButton,
        {
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.92)",
        },
      ]}
    >
      {showSpinner ? (
        <ActivityIndicator size="small" color={onAccentColor} />
      ) : (
        <Ionicons
          name={isPlaying ? "pause" : "play"}
          size={iconSize}
          color={onAccentColor}
          style={!isPlaying ? { marginLeft: 2 } : undefined}
        />
      )}
    </SmoothControlButton>
  );
}

PlayerPlayButton.displayName = "PlayerPlayButton";

// ─── PlayerSlider ────────────────────────────────────────────────────────────
// Custom Spotify-style scrubber. The visual fill/thumb stay in-app, while the
// gesture runs on the UI thread so dragging remains smooth.

const PLAYER_SLIDER_MINIMUM_TRACK_COLOR = "#F7FAFF";
const PLAYER_SLIDER_MAXIMUM_TRACK_COLOR = "rgba(247,250,255,0.28)";
const PLAYER_SLIDER_THUMB_COLOR = "#F7FAFF";
const PLAYER_SLIDER_TOUCH_HEIGHT = 36;
const PLAYER_SLIDER_THUMB_SIZE = 10;

function clampUnit(value: number): number {
  "worklet";
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function progressFromGestureX(x: number, width: number): number {
  "worklet";
  const safeWidth = Math.max(1, width);
  return clampUnit(x / safeWidth);
}

type PlayerSliderProps = {
  value: number;
  minimumValue: number;
  maximumValue: number;
  disabled?: boolean;
  onSlidingStart?: () => void;
  onValueChange?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  onSlidingCancel?: () => void;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: React.ComponentProps<typeof View>["accessibilityRole"];
  accessibilityValue?: React.ComponentProps<typeof View>["accessibilityValue"];
};

function PlayerSlider({
  value,
  minimumValue,
  maximumValue,
  disabled = false,
  onSlidingStart,
  onValueChange,
  onSlidingComplete,
  onSlidingCancel,
  accessible,
  accessibilityLabel,
  accessibilityRole,
  accessibilityValue,
}: PlayerSliderProps) {
  const trackWidth = useSharedValue(0);
  const visualProgress = useSharedValue(0);
  const isSlidingShared = useSharedValue(0);
  const didCompleteGesture = useSharedValue(0);
  const isSlidingRef = useRef(false);
  const range = maximumValue - minimumValue;
  const normalizedValue = range > 0 ? clampUnit((value - minimumValue) / range) : 0;

  useEffect(() => {
    if (!isSlidingRef.current) {
      visualProgress.value = normalizedValue;
    }
  }, [normalizedValue, visualProgress]);

  useEffect(() => {
    if (!disabled) return;
    isSlidingRef.current = false;
    isSlidingShared.value = 0;
  }, [disabled, isSlidingShared]);

  const emitValue = useCallback(
    (nextProgress: number, shouldComplete: boolean) => {
      const nextValue = minimumValue + clampUnit(nextProgress) * range;
      onValueChange?.(nextValue);
      if (!shouldComplete) return;

      isSlidingRef.current = false;
      onSlidingComplete?.(nextValue);
    },
    [minimumValue, onSlidingComplete, onValueChange, range]
  );

  const beginSliding = useCallback(() => {
    if (isSlidingRef.current) return;
    isSlidingRef.current = true;
    onSlidingStart?.();
  }, [onSlidingStart]);

  const cancelSliding = useCallback(() => {
    if (!isSlidingRef.current) return;
    isSlidingRef.current = false;
    onSlidingCancel?.();
  }, [onSlidingCancel]);

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (disabled || range <= 0) return;
      const step = range / 20;
      const direction = event.nativeEvent.actionName === "increment" ? 1 : -1;
      const nextValue = Math.min(maximumValue, Math.max(minimumValue, value + step * direction));
      onSlidingStart?.();
      onValueChange?.(nextValue);
      onSlidingComplete?.(nextValue);
    },
    [disabled, maximumValue, minimumValue, onSlidingComplete, onSlidingStart, onValueChange, range, value]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .minDistance(0)
        .onTouchesDown((event) => {
          const touch = event.allTouches[0] ?? event.changedTouches[0];
          if (!touch) return;

          didCompleteGesture.value = 0;
          isSlidingShared.value = 1;
          const nextProgress = progressFromGestureX(touch.x, trackWidth.value);
          visualProgress.value = nextProgress;
          runOnJS(beginSliding)();
          runOnJS(emitValue)(nextProgress, false);
        })
        .onBegin((event) => {
          if (isSlidingShared.value > 0) return;

          didCompleteGesture.value = 0;
          isSlidingShared.value = 1;
          const nextProgress = progressFromGestureX(event.x, trackWidth.value);
          visualProgress.value = nextProgress;
          runOnJS(beginSliding)();
          runOnJS(emitValue)(nextProgress, false);
        })
        .onUpdate((event) => {
          const nextProgress = progressFromGestureX(event.x, trackWidth.value);
          visualProgress.value = nextProgress;
          runOnJS(emitValue)(nextProgress, false);
        })
        .onEnd(() => {
          if (didCompleteGesture.value === 1) return;

          didCompleteGesture.value = 1;
          runOnJS(emitValue)(visualProgress.value, true);
        })
        .onTouchesUp((event) => {
          if (didCompleteGesture.value === 1) return;

          const touch = event.changedTouches[0] ?? event.allTouches[0];
          if (!touch) return;

          const nextProgress = progressFromGestureX(touch.x, trackWidth.value);
          visualProgress.value = nextProgress;
          didCompleteGesture.value = 1;
          runOnJS(emitValue)(nextProgress, true);
        })
        .onFinalize(() => {
          isSlidingShared.value = 0;
          if (didCompleteGesture.value === 0) {
            runOnJS(cancelSliding)();
          }
        }),
    [beginSliding, cancelSliding, didCompleteGesture, disabled, emitValue, isSlidingShared, trackWidth, visualProgress]
  );

  const fillAnimatedStyle = useAnimatedStyle(() => ({
    width: Math.max(0, trackWidth.value * visualProgress.value),
  }));

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    opacity: disabled ? 0.45 : 1,
    transform: [
      {
        translateX: Math.max(0, trackWidth.value * visualProgress.value) - PLAYER_SLIDER_THUMB_SIZE / 2,
      },
      { scale: isSlidingShared.value ? 1.16 : 1 },
    ],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <View
        accessible={accessible}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityValue={accessibilityValue}
        onAccessibilityAction={handleAccessibilityAction}
        onLayout={(event) => {
          trackWidth.value = Math.max(1, event.nativeEvent.layout.width);
        }}
        style={[styles.playerSlider, disabled && styles.playerSliderDisabled]}
      >
        <View style={styles.playerSliderTrack}>
          <Reanimated.View style={[styles.playerSliderFill, fillAnimatedStyle]} />
        </View>
        <Reanimated.View pointerEvents="none" style={[styles.playerSliderThumb, thumbAnimatedStyle]} />
      </View>
    </GestureDetector>
  );
}

type PlayerSpotifyProgressProps = {
  screenSongId: string;
  songDurationSeconds: number;
  isShortScreen: boolean;
  isDevPreviewActive: boolean;
  devPreviewProgress: number;
  setDevPreviewProgress: React.Dispatch<React.SetStateAction<number>>;
  seekTo: (progress: number) => void;
  onSeekingChange: (isSeeking: boolean) => void;
};

const PlayerSpotifyProgress = memo(function PlayerSpotifyProgress({
  screenSongId,
  songDurationSeconds,
  isShortScreen,
  isDevPreviewActive,
  devPreviewProgress,
  setDevPreviewProgress,
  seekTo,
  onSeekingChange,
}: PlayerSpotifyProgressProps) {
  const { progress, duration } = usePlayerProgress();
  const { isPlaying } = usePlayerRow();
  const { isBuffering, isLoading } = usePlaybackPlayState();

  const [localProgress, setLocalProgress] = useState(progress);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const lastSyncRef = useRef({ progress, timestamp: Date.now() });

  // Sync with global progress changes
  useEffect(() => {
    if (isScrubbing) return;
    lastSyncRef.current = { progress, timestamp: Date.now() };
  }, [isScrubbing, progress]);

  // A song progress bar moves by less than a pixel per sample at 4 Hz on a
  // phone. Updating React state every animation frame needlessly rerendered
  // the player around 60 times per second and kept multiple CPU cores busy.
  useEffect(() => {
    if (!isPlaying || isBuffering || isLoading || isScrubbing) return;

    // Reset the reference point to prevent jumping after pause/resume or buffering
    lastSyncRef.current = { progress, timestamp: Date.now() };

    const updateInterpolatedProgress = () => {
      const elapsedSec = (Date.now() - lastSyncRef.current.timestamp) / 1000;
      const durationSec = duration / 1000;
      if (durationSec > 0) {
        const addedProgress = elapsedSec / durationSec;
        const nextProgress = Math.min(1.0, lastSyncRef.current.progress + addedProgress);
        setLocalProgress(nextProgress);
      }
    };

    updateInterpolatedProgress();
    const interval = setInterval(updateInterpolatedProgress, 250);
    return () => clearInterval(interval);
  }, [isPlaying, isBuffering, isLoading, duration, isScrubbing, progress]);

  const liveProgress = isPlaying && !isScrubbing ? localProgress : progress;
  const playerProgress = isDevPreviewActive ? devPreviewProgress : liveProgress;
  const safeSongDuration = Number.isFinite(songDurationSeconds) ? Math.max(0, songDurationSeconds) : 0;
  const playerDuration = isDevPreviewActive ? safeSongDuration * 1000 : duration;
  const playerPositionMillis = isDevPreviewActive
    ? Math.round(safeSongDuration * 1000 * devPreviewProgress)
    : Math.round(playerDuration * playerProgress);
  const currentTimeSec = Math.floor(playerPositionMillis / 1000);
  const totalDurationSec = Math.floor(playerDuration / 1000);
  const effectiveDurationSec = totalDurationSec > 0 ? totalDurationSec : safeSongDuration;
  const canSeek =
    isDevPreviewActive ||
    effectiveDurationSec > 0 ||
    (Platform.OS === "android" && Boolean(screenSongId));
  const displayDuration =
    totalDurationSec > 0 ? formatDuration(totalDurationSec) : formatDuration(safeSongDuration);

  const updateSeeking = useCallback(
    (next: boolean) => onSeekingChange(next),
    [onSeekingChange]
  );

  // Reset interactive state when the song changes.
  useEffect(() => {
    setIsScrubbing(false);
    updateSeeking(false);
    if (!isDevPreviewActive) {
      setLocalProgress(0);
      lastSyncRef.current = { progress: 0, timestamp: Date.now() };
    }
  }, [isDevPreviewActive, screenSongId, updateSeeking]);

  // Slider works on a fixed 0..1000 scale. Convert normalized progress to/from it.
  const SLIDER_MAX = 1000;
  const sliderValue = Math.round(playerProgress * SLIDER_MAX);
  const currentDisplayTime = formatDuration(
    Math.min(effectiveDurationSec, currentTimeSec)
  );

  // While the user is dragging, don't sync from playback; let the custom
  // scrubber follow the finger and only commit the seek when the gesture ends.
  const handleSlidingStart = useCallback(() => {
    setIsScrubbing(true);
    updateSeeking(true);
  }, [updateSeeking]);

  const handleValueChange = useCallback((value: number) => {
    const normalized = clampUnit(value / SLIDER_MAX);
    if (isDevPreviewActive) {
      setDevPreviewProgress(normalized);
      return;
    }
    setLocalProgress(normalized);
  }, [isDevPreviewActive, setDevPreviewProgress]);

  const handleSlidingComplete = useCallback((value: number) => {
    const normalized = clampUnit(value / SLIDER_MAX);
    setIsScrubbing(false);
    updateSeeking(false);
    if (isDevPreviewActive) {
      setDevPreviewProgress(normalized);
      return;
    }
    setLocalProgress(normalized);
    seekTo(normalized);
  }, [isDevPreviewActive, seekTo, setDevPreviewProgress, updateSeeking]);

  const handleSlidingCancel = useCallback(() => {
    setIsScrubbing(false);
    updateSeeking(false);
    if (!isDevPreviewActive) {
      setLocalProgress(progress);
    }
  }, [isDevPreviewActive, progress, updateSeeking]);

  return (
    <View
      style={[
        styles.spotifyProgressWrap,
        { marginTop: isShortScreen ? 8 : 10, marginHorizontal: isShortScreen ? 14 : 20 },
      ]}
    >
      <PlayerSlider
        value={sliderValue}
        minimumValue={0}
        maximumValue={SLIDER_MAX}
        onSlidingStart={handleSlidingStart}
        onValueChange={handleValueChange}
        onSlidingComplete={handleSlidingComplete}
        onSlidingCancel={handleSlidingCancel}
        disabled={!canSeek}
        accessible
        accessibilityLabel="Playback position"
        accessibilityRole="adjustable"
        accessibilityValue={{
          text: `${currentDisplayTime} of ${displayDuration}`,
        }}
      />
      <View style={styles.spotifyTimeRow}>
        <Text style={styles.spotifyTimeText}>{currentDisplayTime}</Text>
        <Text style={styles.spotifyTimeText}>{displayDuration}</Text>
      </View>
    </View>
  );
});

PlayerSpotifyProgress.displayName = "PlayerSpotifyProgress";


const QueueSongRow = memo(
  ({
    item,
    index,
    isCurrent,
    isShortScreen,
    isPlaying,
    onPress,
  }: {
    item: Song;
    index: number;
    isCurrent: boolean;
    isShortScreen: boolean;
    isPlaying: boolean;
    onPress: (item: Song) => void;
  }) => {
    const handlePress = useCallback(() => onPress(item), [item, onPress]);
    const rowStyle = useMemo(
      () => [
        styles.queueRow,
        isCurrent ? styles.queueRowActive : null,
        isShortScreen ? styles.queueRowCompact : null,
      ],
      [isCurrent, isShortScreen]
    );

    return (
      <Pressable style={rowStyle} onPress={handlePress}>
        <View style={styles.queueLead}>
          {isCurrent ? (
            <EqualizerBars isPlaying={isPlaying} size={3} color="#F7FAFF" />
          ) : (
            <Text style={styles.queueIndex}>{index + 1}</Text>
          )}
        </View>

        <Image
          recyclingKey={item.id}
          source={{ uri: item.coverUrl || undefined }}
          style={isShortScreen ? styles.queueThumbCompact : styles.queueThumb}
          contentFit="cover"
          transition={120}
        />

        <View style={styles.queueTextWrap}>
          <Text
            style={isCurrent ? styles.queueTitleActive : styles.queueTitle}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            style={isCurrent ? styles.queueMetaActive : styles.queueMeta}
            numberOfLines={1}
          >
            {item.artist}
          </Text>
        </View>

        <Text style={isCurrent ? styles.queueDurationActive : styles.queueDuration}>
          {formatDuration(item.duration)}
        </Text>
      </Pressable>
    );
  }
);

QueueSongRow.displayName = "QueueSongRow";

type ArtistExploreItem =
  | { type: "song"; id: string; song: Song }
  | { type: "artist"; id: string; name: string; image: string };

function ArtistExploreTile({
  item,
  fallbackCoverUrl,
  onSongPress,
  onArtistPress,
}: {
  item: ArtistExploreItem;
  fallbackCoverUrl: string;
  onSongPress: (song: Song) => void;
  onArtistPress: (artist: { id: string; name: string; image: string }) => void;
}) {
  const handlePress = useCallback(() => {
    if (item.type === "song") {
      onSongPress(item.song);
      return;
    }
    onArtistPress({ id: item.id, name: item.name, image: item.image });
  }, [item, onArtistPress, onSongPress]);

  const imageUrl = item.type === "song" ? item.song.coverUrl : item.image || fallbackCoverUrl;
  const title = item.type === "song" ? item.song.title : `Similar to ${item.name}`;

  return (
    <Pressable style={styles.exploreTile} onPress={handlePress}>
      <Image
        source={{ uri: imageUrl || undefined }}
        style={styles.exploreTileImage}
        contentFit="cover"
        transition={120}
      />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.74)"]} style={styles.exploreTileShade} />
      {item.type === "song" ? <Text style={styles.exploreTileEyebrow}>Song</Text> : null}
      <Text style={styles.exploreTileText} numberOfLines={3}>{title}</Text>
    </Pressable>
  );
}

const DEV_PREVIEW_SONGS: Song[] = [
  {
    id: "dev-preview-1",
    title: "Midnight Drive",
    artist: "Mavrixfy Preview",
    album: "UI Preview",
    duration: 214,
    coverUrl: "https://placehold.co/600x600/1b2d4b/f4f7fb?text=Preview+1",
    genre: "Preview",
    audioUrl: "",
    source: "local",
  },
  {
    id: "dev-preview-2",
    title: "Afterglow",
    artist: "Mavrixfy Preview",
    album: "UI Preview",
    duration: 187,
    coverUrl: "https://placehold.co/600x600/3d2748/f4f7fb?text=Preview+2",
    genre: "Preview",
    audioUrl: "",
    source: "local",
  },
  {
    id: "dev-preview-3",
    title: "Blue Avenue",
    artist: "Mavrixfy Preview",
    album: "UI Preview",
    duration: 201,
    coverUrl: "https://placehold.co/600x600/14385a/f4f7fb?text=Preview+3",
    genre: "Preview",
    audioUrl: "",
    source: "local",
  },
];
const EMPTY_PLAYER_SCROLL_SONGS: Song[] = [];

function LegacyPlayerScreen() {
  return useLegacyPlayerScreenView();
}

function useLegacyPlayerScreenView() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [ambientBackdropEnabled, setAmbientBackdropEnabled] = useState(true);
  const [isNavigationFocused, setIsNavigationFocused] = useState(() => navigation.isFocused());
  const [isAppActive, setIsAppActive] = useState(() => AppState.currentState === "active");
  const isScreenFocused = isNavigationFocused && isAppActive;

  const [isLowEnd, setIsLowEnd] = useState(false);

  useEffect(() => {
    let mounted = true;

    void getDevicePerformanceProfile().then((profile) => {
      if (mounted) {
        setIsLowEnd(profile.isLowEndDevice);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  // react-doctor-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    let mounted = true;
    const fetchSettings = () => {
      getSettings().then((s) => {
        if (mounted) {
          setAmbientBackdropEnabled(s.ambientBackdropEnabled);
        }
      });
    };

    fetchSettings();
    const unsubscribeFocus = navigation.addListener("focus", () => {
      fetchSettings();
      setIsNavigationFocused(true);
    });
    const unsubscribeBlur = navigation.addListener("blur", () => {
      setIsNavigationFocused(false);
    });

    return () => {
      mounted = false;
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setIsAppActive(nextState === "active");
    });
    return () => subscription.remove();
  }, []);
  const {
    currentSong,
    queue,
    sourceQueue,
    queueIndex,
    repeatMode,
  } = usePlaybackNowPlaying();
  const playbackState = usePlaybackPlayState();
  const {
    togglePlay,
    playSong,
    nextSong,
    prevSong,
    seekTo,
    toggleShuffle,
    toggleRepeat,
    toggleLike,
    isLiked,
    albumColor,
    setAlbumColor,
    setTextColor,
    setYoutubePlayerFrame,
  } = usePlayerActions();

  const { positionMillis } = usePlayerProgress();

  const [isProgressSeeking, setIsProgressSeeking] = useState(false);
  const [playerAd, setPlayerAd] = useState<GoogleNativeAd | null>(null);
  const [playerAdLoaded, setPlayerAdLoaded] = useState(false);
  const [manualPlayerAdSongId, setManualPlayerAdSongId] = useState<string | null>(null);
  const playerAdCoverCooldownUntilRef = useRef(0);
  const playerAdSongsSinceCoverRef = useRef(PLAYER_AD_COVER_COOLDOWN_SONGS);
  const lastPlayerAdSongIdRef = useRef<string | null>(currentSong?.id ?? null);
  const youtubeVideoFrameRef = useRef<View | null>(null);
  const [isLoadingDevTrack, setIsLoadingDevTrack] = useState(false);
  const [isDevPreviewEnabled, setIsDevPreviewEnabled] = useState(false);
  const [devPreviewIndex, setDevPreviewIndex] = useState(0);
  const [devPreviewIsPlaying, setDevPreviewIsPlaying] = useState(true);
  const [devPreviewProgress, setDevPreviewProgress] = useState(0.18);
  const [, setDevPreviewIsShuffled] = useState(false);
  const [devPreviewRepeatMode, setDevPreviewRepeatMode] = useState<"off" | "all" | "one">("off");
  const [devPreviewLikedSongIds, setDevPreviewLikedSongIds] = useState<string[]>([]);
  const artScrollXRef = useRef<Animated.Value | null>(null);
  if (artScrollXRef.current === null) artScrollXRef.current = new Animated.Value(0);
  const artScrollX = artScrollXRef.current;
  const artCarouselRef = useRef<FlatList<ArtworkQueueItem> | null>(null);
  const hasAlignedArtCarouselRef = useRef(false);
  const pendingArtworkTargetIndexRef = useRef<number | null>(null);
  const didHandleSheetDismissRef = useRef(false);
  const sheetDetentReadyAtRef = useRef(0);
  const playerScrollOffsetYRef = useRef(0);
  const queueTouchReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerDismissGestureEnabledRef = useRef(true);
  const playerDismissGestureEnabledShared = useSharedValue(1);
  const playerScrollOffsetYShared = useSharedValue(0);
  const playerDismissTranslateY = useSharedValue(0);
  const optionsPressLockRef = useRef(false);
  // react-doctor-disable-next-line react-doctor/no-event-handler -- isDevPreviewActive is a dev-only preview mode helper, not a fake event handler state.
  const isDevPreviewActive = __DEV__ && !currentSong && isDevPreviewEnabled;

  const setPlayerDismissGestureEnabled = useCallback((enabled: boolean) => {
    if (playerDismissGestureEnabledRef.current === enabled) return;

    playerDismissGestureEnabledRef.current = enabled;
    playerDismissGestureEnabledShared.value = enabled ? 1 : 0;
    if (!enabled) {
      playerDismissTranslateY.value = withSpring(0, PLAYER_PRIMARY_DISMISS_SPRING);
    }
    if (Platform.OS !== "ios") return;

    navigation.setOptions({ gestureEnabled: enabled });
  }, [navigation, playerDismissGestureEnabledShared, playerDismissTranslateY]);

  useEffect(() => {
    playerDismissGestureEnabledRef.current = true;
    playerDismissGestureEnabledShared.value = 1;
    playerDismissTranslateY.value = 0;
    if (Platform.OS === "ios") {
      navigation.setOptions({ gestureEnabled: true });
    }

    return () => {
      if (queueTouchReleaseTimerRef.current) {
        clearTimeout(queueTouchReleaseTimerRef.current);
        queueTouchReleaseTimerRef.current = null;
      }
      if (Platform.OS === "ios") {
        navigation.setOptions({ gestureEnabled: true });
      }
    };
  }, [navigation, playerDismissGestureEnabledShared, playerDismissTranslateY]);

  useEffect(() => {
    const unsubscribeFocus = navigation.addListener("focus", () => {
      didHandleSheetDismissRef.current = false;
      sheetDetentReadyAtRef.current = Date.now() + 450;
      playerDismissGestureEnabledRef.current = true;
      playerDismissGestureEnabledShared.value = 1;
      playerDismissTranslateY.value = 0;
      if (Platform.OS === "ios") {
        navigation.setOptions({ gestureEnabled: true });
      }
    });

    return () => {
      unsubscribeFocus();
    };
  }, [navigation, playerDismissGestureEnabledShared, playerDismissTranslateY]);

  // ── Defer heavy work until after the open animation completes ───────────────
  const [interactionReady, setInteractionReady] = useState(false);
  useEffect(() => {
    globalPlayerDetailsVisibleRef.setVisible(true);
    const task = InteractionManager.runAfterInteractions(() => {
      setInteractionReady(true);
    });
    const fallbackTimer = setTimeout(() => {
      setInteractionReady(true);
    }, 300);
    return () => {
      globalPlayerDetailsVisibleRef.setVisible(false);
      task.cancel();
      clearTimeout(fallbackTimer);
    };
  }, []);


  // ── About the artist / Credits state ────────────────────────────────────────
  const [artistInfo, setArtistInfo] = useState<JioSaavnArtist | null>(null);
  const [artistFollowing, setArtistFollowing] = useState(false);
  const artistFetchIdRef = useRef<string>("");
  // react-doctor-disable-next-line react-doctor/no-event-handler -- devPreviewIndex is used to index into DEV_PREVIEW_SONGS in dev-preview mode.
  const devPreviewSong = DEV_PREVIEW_SONGS[Math.max(0, Math.min(devPreviewIndex, DEV_PREVIEW_SONGS.length - 1))] ?? DEV_PREVIEW_SONGS[0];
  const screenSong = currentSong ?? (isDevPreviewActive ? devPreviewSong : null);
  const screenSongIsYouTube = Boolean(screenSong?.source === "youtube" || screenSong?.id?.startsWith("youtube_"));

  const [backgroundVideoId, setBackgroundVideoId] = useState<string | null>(null);

  // react-doctor-disable-next-line react-doctor/no-cascading-set-state -- background video id follows the current song after the resolver verifies an official visual match.
  useEffect(() => {
    if (!screenSong || !screenSongIsYouTube || !ambientBackdropEnabled || isLowEnd) {
      setBackgroundVideoId(null);
      return;
    }

    setBackgroundVideoId(null);

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void getYouTubeMusicVisualVideoId(screenSong)
        .then((visualVideoId) => {
          if (cancelled) return;
          setBackgroundVideoId(visualVideoId || null);
        })
        .catch(() => undefined);
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [ambientBackdropEnabled, isLowEnd, screenSong, screenSongIsYouTube]);

  const [playedSongId, setPlayedSongId] = useState<string | null>(null);
  const hasStartedPlaying = screenSong?.id ? playedSongId === screenSong.id : false;

  useEffect(() => {
    if (screenSong?.id && playbackState.isPlaying && !playbackState.isLoading && !playbackState.isBuffering) {
      // react-doctor-disable-next-line react-doctor/no-derived-state -- playedSongId tracks whether the current song has started playing at least once, which cannot be derived from instantaneous playbackState.
      setPlayedSongId(screenSong.id);
    }
  }, [screenSong?.id, playbackState.isPlaying, playbackState.isLoading, playbackState.isBuffering]);

  const ambientVideoLayoutActive = useMemo(() => Boolean(
    ambientBackdropEnabled &&
    backgroundVideoId &&
    screenSongIsYouTube &&
    !isLowEnd
  ), [ambientBackdropEnabled, backgroundVideoId, screenSongIsYouTube, isLowEnd]);

  const shouldRenderBackgroundVideo = useMemo(() => Boolean(
    ambientVideoLayoutActive &&
    hasStartedPlaying
  ), [ambientVideoLayoutActive, hasStartedPlaying]);
  const currentPlayerAdSongId = screenSong?.id ?? null;
  if (currentPlayerAdSongId !== lastPlayerAdSongIdRef.current) {
    if (lastPlayerAdSongIdRef.current) {
      playerAdSongsSinceCoverRef.current = Math.min(
        PLAYER_AD_COVER_COOLDOWN_SONGS,
        playerAdSongsSinceCoverRef.current + 1
      );
    }
    lastPlayerAdSongIdRef.current = currentPlayerAdSongId;
  }
  const isPlayerAdCoverCooldownActive =
    Date.now() < playerAdCoverCooldownUntilRef.current ||
    playerAdSongsSinceCoverRef.current < PLAYER_AD_COVER_COOLDOWN_SONGS;
  const showAdInPlayer = Boolean(
    currentPlayerAdSongId &&
      !isLowEnd &&
      playerAdLoaded &&
      playerAd &&
      !isDevPreviewActive &&
      (manualPlayerAdSongId === currentPlayerAdSongId || !isPlayerAdCoverCooldownActive)
  );

  useEffect(() => {
    didHandleSheetDismissRef.current = false;
    sheetDetentReadyAtRef.current = Date.now() + 450;
  }, [screenSong?.id]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return () => {};
    }

    const unsubscribe = navigation.addListener("sheetDetentChange" as never, ((event: any) => {
      const index = event?.data?.index;
      const isStable = event?.data?.stable ?? true;
      if (Date.now() < sheetDetentReadyAtRef.current) {
        return;
      }
      if (!isStable || index !== 0) {
        return;
      }
      if (!playerDismissGestureEnabledRef.current) {
        return;
      }
      if (didHandleSheetDismissRef.current) {
        return;
      }
      didHandleSheetDismissRef.current = true;
      safeGoBack();
    }) as never);

    return () => {
      unsubscribe();
    };
  }, [navigation]);

  const applyPlayerArtworkColors = useCallback((primary: string, text: string) => {
    setAlbumColor(primary);
    setTextColor(text);
  }, [setAlbumColor, setTextColor]);

  const publishYoutubeVideoFrame = useCallback(() => {
    requestAnimationFrame(() => {
      youtubeVideoFrameRef.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setYoutubePlayerFrame({ x, y, width, height });
        }
      });
    });
  }, [setYoutubePlayerFrame]);
  
  const handleSongOptionsPress = useCallback(() => {
    if (!screenSong || optionsPressLockRef.current) return;

    optionsPressLockRef.current = true;
    router.push(
      {
        pathname: "/song-options",
        params: {
          song: JSON.stringify(screenSong),
          showDownload: isDevPreviewActive ? "0" : "1",
          canRemove: "0",
          optionContext: "",
          playlistId: "",
          playlistSource: "",
          playlistName: "",
        },
      },
      { dangerouslySingular: () => "song-options" }
    );

    setTimeout(() => {
      optionsPressLockRef.current = false;
    }, 600);
  }, [isDevPreviewActive, screenSong]);
  
  const clearArtistInfo = useCallback(() => {
    setArtistInfo(null);
  }, []);
  const applyArtistInfoSnapshot = useCallback((details: JioSaavnArtist | null, following: boolean) => {
    setArtistInfo(details);
    setArtistFollowing(following);
  }, []);

  useEffect(() => {
    if (!interactionReady) return;
    let active = true;
    const cover = screenSong?.coverUrl?.trim();
    if (!cover) {
      applyPlayerArtworkColors("#25282E", "#F5FBFF");
      return () => {};
    }

    const immediateColors = getImmediateArtworkColor(cover);
    applyPlayerArtworkColors(immediateColors.primary, immediateColors.text);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        extractDominantColor(cover)
          .then((colors) => {
            if (!active) return;
            applyPlayerArtworkColors(colors.primary, colors.text);
          })
          .catch(() => {});
      }, 80);
    });

    return () => {
      active = false;
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [applyPlayerArtworkColors, interactionReady, screenSong?.id, screenSong?.coverUrl]);

  // Fetch artist info whenever the current song's artist changes
  useEffect(() => {
    if (!interactionReady) return;
    const artistName = currentSong?.artist?.split(",")[0]?.trim();
    if (!artistName) { clearArtistInfo(); return; }

    let cancelled = false;
    const fetchId = artistName;
    artistFetchIdRef.current = fetchId;
    clearArtistInfo();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        searchArtists(artistName)
          .then(async (results) => {
            if (cancelled || artistFetchIdRef.current !== fetchId) return;
            const first = results[0];
            if (!first) return;
            const [details, following] = await Promise.all([
              getArtistDetails(first.id),
              isFollowingArtist(first.id),
            ]);
            if (!cancelled && artistFetchIdRef.current === fetchId) {
              applyArtistInfoSnapshot(details, following);
            }
          })
          .catch(() => {});
      }, 300);
    });

    return () => {
      cancelled = true;
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [applyArtistInfoSnapshot, clearArtistInfo, interactionReady, currentSong?.artist]);

  const rawTopInset = Platform.OS === "web" ? 67 : insets.top;
  const topInset = rawTopInset;
  const bottomInset = Platform.OS === "web" ? 28 : insets.bottom;
  const isShortScreen = screenHeight <= 760;
  const isVeryShortScreen = screenHeight <= 700;
  const topBarHeight = isShortScreen ? 50 : 54;
  const controlButtonSize = isVeryShortScreen ? 38 : isShortScreen ? 40 : 42;
  const prevNextButtonSize = isVeryShortScreen ? 46 : isShortScreen ? 50 : 54;
  const prevNextIconSize = isVeryShortScreen ? 24 : isShortScreen ? 27 : 30;
  const shuffleRepeatIconSize = isVeryShortScreen ? 18 : isShortScreen ? 19 : 20;
  const playButtonSize = isVeryShortScreen ? 60 : isShortScreen ? 64 : 68;
  const playIconSize = isVeryShortScreen ? 28 : isShortScreen ? 31 : 34;
  const controlsRowGap = isVeryShortScreen ? 8 : isShortScreen ? 10 : 12;
  const songDetailActionSize = isVeryShortScreen ? 38 : 42;
  const songDetailIconSize = isVeryShortScreen ? 21 : 23;
  const listBottomPadding =
    Platform.OS === "web"
      ? 16
      : Math.max(PLAYER_DETAIL_BOTTOM_OVERLAY_PADDING, bottomInset + PLAYER_DETAIL_BOTTOM_OVERLAY_PADDING);
  const legacyVideoArtByWidth = Math.min(screenWidth - 62, 336);
  const legacyVideoArtByHeight = Math.max(192, Math.floor(screenHeight * (isVeryShortScreen ? 0.3 : 0.34)));
  const largeArtworkByWidth = Math.min(screenWidth - (isShortScreen ? 44 : 38), isShortScreen ? 348 : 388);
  const largeArtworkByHeight = Math.max(
    isVeryShortScreen ? 220 : 240,
    Math.floor(screenHeight * (isVeryShortScreen ? 0.34 : isShortScreen ? 0.38 : 0.42))
  );
  const artSize = ambientVideoLayoutActive
    ? Math.min(legacyVideoArtByWidth, legacyVideoArtByHeight)
    : Math.min(largeArtworkByWidth, largeArtworkByHeight);

  const playerDismissAnimatedStyle = useAnimatedStyle(() => {
    const translateY = Math.max(0, playerDismissTranslateY.value);
    return {
      transform: [{ translateY }],
    };
  }, []);

  const targetScale = (Platform.OS === "ios" ? 40 : 48) / artSize;
  const targetCenterX = Platform.OS === "ios" ? 40 : 48;
  const cardTop = topInset + 54 + (ambientVideoLayoutActive ? (isShortScreen ? 4 : 8) : (isVeryShortScreen ? 8 : isShortScreen ? 12 : 18));
  const cardCenterY = cardTop + artSize / 2;
  const targetCenterY = screenHeight - bottomInset - 30;
  const targetTranslateYRelative = targetCenterY - screenHeight - cardCenterY;

  const artworkDismissAnimatedStyle = useAnimatedStyle(() => {
    const translateYVal = Math.max(0, playerDismissTranslateY.value);
    
    const scaleVal = interpolate(
      translateYVal,
      [0, screenHeight],
      [1, targetScale],
      Extrapolation.CLAMP
    );

    const translateXVal = interpolate(
      translateYVal,
      [0, screenHeight],
      [0, targetCenterX - screenWidth / 2],
      Extrapolation.CLAMP
    );

    const translateYValRelative = interpolate(
      translateYVal,
      [0, screenHeight],
      [0, targetTranslateYRelative],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { translateX: translateXVal },
        { translateY: translateYValRelative },
        { scale: scaleVal },
      ],
    };
  }, [screenHeight, screenWidth, targetScale, targetCenterX, targetTranslateYRelative]);

  const controlsDismissAnimatedStyle = useAnimatedStyle(() => {
    const translateY = Math.max(0, playerDismissTranslateY.value);
    const opacity = interpolate(
      translateY,
      [0, screenHeight * 0.22],
      [1, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity,
    };
  }, [screenHeight]);

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const translateY = Math.max(0, playerDismissTranslateY.value);
    const opacity = interpolate(
      translateY,
      [0, screenHeight],
      [1, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity,
    };
  }, [screenHeight]);

  const bgOpacityAnimatedStyle = useAnimatedStyle(() => {
    const translateY = Math.max(0, playerDismissTranslateY.value);
    const opacity = interpolate(
      translateY,
      [0, screenHeight * 0.45],
      [1, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity,
    };
  }, [screenHeight]);

  const livePlayingQueue = useMemo(() => {
    const hasFullActiveQueue = queue.length > 1;
    const hasFullSourceQueue = sourceQueue.length > 1;
    if (hasFullActiveQueue) {
      return queue.filter((song) => Boolean(song?.id));
    }
    if (hasFullSourceQueue) {
      return sourceQueue.filter((song) => Boolean(song?.id));
    }
    if (queue.length === 1) {
      return queue;
    }
    return currentSong ? [currentSong] : [];
  }, [currentSong, queue, sourceQueue]);
  const liveActiveQueueIndex = useMemo(() => {
    if (livePlayingQueue.length === 0) return 0;
    if (currentSong?.id) {
      const currentIndex = livePlayingQueue.findIndex((song) => song.id === currentSong.id);
      if (currentIndex >= 0) {
        return currentIndex;
      }
    }
    const rawIndex = queue.length > 0 ? queueIndex : 0;
    return Math.max(0, Math.min(rawIndex, livePlayingQueue.length - 1));
  }, [currentSong?.id, livePlayingQueue, queue.length, queueIndex]);
  const playingQueue = isDevPreviewActive ? DEV_PREVIEW_SONGS : livePlayingQueue;
  const activeQueueIndex = isDevPreviewActive ? devPreviewIndex : liveActiveQueueIndex;

  useEffect(() => {
    if (!screenSongIsYouTube || !ambientVideoLayoutActive) {
      setYoutubePlayerFrame(null);
      return;
    }

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      publishYoutubeVideoFrame();
    });
    const layoutTimer = setTimeout(publishYoutubeVideoFrame, 260);

    return () => {
      interactionTask.cancel();
      clearTimeout(layoutTimer);
    };
  }, [
    activeQueueIndex,
    publishYoutubeVideoFrame,
    screenHeight,
    screenSong?.id,
    screenSongIsYouTube,
    ambientVideoLayoutActive,
    screenWidth,
    setYoutubePlayerFrame,
  ]);

  useEffect(() => {
    return () => {
      setYoutubePlayerFrame(null);
    };
  }, [setYoutubePlayerFrame]);

  const artworkQueue = useMemo<ArtworkQueueItem[]>(() => {
    const occurrenceByKey = new Map<string, number>();
    return playingQueue.map((song) => {
      const baseKey = String(song.id || song.audioUrl || song.coverUrl || song.title || "artwork");
      const occurrence = occurrenceByKey.get(baseKey) ?? 0;
      occurrenceByKey.set(baseKey, occurrence + 1);
      return {
        song,
        artworkKey: occurrence === 0 ? baseKey : `${baseKey}-${occurrence}`,
      };
    });
  }, [playingQueue]);
  const playerIsPlaying = isDevPreviewActive ? devPreviewIsPlaying : playbackState.isPlaying;
  const playerRepeatMode = isDevPreviewActive ? devPreviewRepeatMode : repeatMode;

  useEffect(() => {
    let active = true;
    let loadedAd: GoogleNativeAd | null = null;

    const loadPlayerNativeAd = async () => {
      try {
        const adsModule = getGoogleMobileAdsModule();
        if (!adsModule || !AD_UNITS.NATIVE) {
          return;
        }

        const { default: mobileAds, NativeAd } = adsModule;

        if (Platform.OS === "ios") {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { requestTrackingPermissionsAsync } = require("expo-tracking-transparency");
            await requestTrackingPermissionsAsync();
          } catch {
            // Ignore tracking permission errors if unsupported
          }
        }

        await mobileAds().initialize();
        if (!active) return;

        // Using centrally configured static native ad unit ID
        const ad = await NativeAd.createForAdRequest(AD_UNITS.NATIVE, {
          requestNonPersonalizedAdsOnly: true,
        });

        if (!active) {
          ad.destroy();
          return;
        }

        loadedAd = ad;
        setPlayerAd(ad);
        setPlayerAdLoaded(true);
      } catch (err) {
        logger.warn("Player screen native ad failed to load:", err);
      }
    };

    loadPlayerNativeAd();

    return () => {
      active = false;
      if (loadedAd) {
        loadedAd.destroy();
      }
    };
  }, []);

  const adsModule = playerAd ? getGoogleMobileAdsModule() : null;
  const NativeAdView = adsModule?.NativeAdView;
  const NativeAsset = adsModule?.NativeAsset;
  const NativeAssetType = adsModule?.NativeAssetType;
  const NativeMediaView = adsModule?.NativeMediaView;


  useEffect(() => {
    const urls = mapFilter([
      playingQueue[activeQueueIndex - 1]?.coverUrl,
      playingQueue[activeQueueIndex]?.coverUrl,
      playingQueue[activeQueueIndex + 1]?.coverUrl,
    ], (url) => url?.trim(), (url): url is string => Boolean(url));

    if (urls.length === 0) return;
    void Image.prefetch(urls, "memory-disk").catch(() => {});
    preloadDominantColors(urls);
  }, [activeQueueIndex, playingQueue]);

  const artistTopSongs = useMemo(() => {
    if (!artistInfo?.topSongs?.length || !screenSong?.id) return [];
    const seen = new Set<string>([screenSong.id]);
    const songs: Song[] = [];
    for (const item of artistInfo.topSongs) {
      const converted = convertJioSaavnSong(item);
      if (!converted.id || seen.has(converted.id)) continue;
      seen.add(converted.id);
      songs.push(converted);
      if (songs.length >= 6) break;
    }
    return songs;
  }, [artistInfo?.topSongs, screenSong?.id]);
  const artistExploreItems = useMemo<ArtistExploreItem[]>(() => {
    const items: ArtistExploreItem[] = artistTopSongs.slice(0, 5).map((song) => ({
      type: "song",
      id: `song-${song.id}`,
      song,
    }));

    for (const artist of artistInfo?.similarArtists?.slice(0, 2) ?? []) {
      items.push({
        type: "artist",
        id: `artist-${artist.id}`,
        name: artist.name,
        image: artist.image?.length ? getBestImageUrl(artist.image) : "",
      });
    }

    return items;
  }, [artistInfo?.similarArtists, artistTopSongs]);
  const handleArtistFollowPress = useCallback(async () => {
    if (!artistInfo) return;

    const image = artistInfo.image?.length ? getBestImageUrl(artistInfo.image) : "";
    const nowFollowing = await toggleFollowArtist({
      id: artistInfo.id,
      name: artistInfo.name,
      image,
      followedAt: getCurrentTimestamp(),
    });
    setArtistFollowing(nowFollowing);
  }, [artistInfo]);
  const liked = screenSong
    ? isDevPreviewActive
      ? devPreviewLikedSongIds.includes(screenSong.id)
      : isLiked(screenSong.id)
    : false;
  const queueRowHeight = isShortScreen ? 48 : 54;
  const queueContentHeight = playingQueue.length * queueRowHeight + 18;
  const queueMaxViewportHeight = Math.max(
    isShortScreen ? 300 : 360,
    Math.floor(screenHeight * (isShortScreen ? 0.42 : 0.46))
  );
  const queueViewportHeight = Math.min(queueContentHeight, queueMaxViewportHeight);
  const queueCanScroll = queueContentHeight > queueViewportHeight + 1;
  const queueViewportStyle = useMemo(
    () => ({ height: queueViewportHeight, maxHeight: queueViewportHeight }),
    [queueViewportHeight]
  );
  const artCarouselViewportWidth = screenWidth;
  const artCarouselPageWidth = artCarouselViewportWidth;
  const artCarouselSnapInterval = artCarouselPageWidth;

  const playerTheme = useMemo(
    () => createSpotifyColorTheme(albumColor || Colors.primary),
    [albumColor]
  );
  const gradientColors = playerTheme.playerGradient;
  const sheetTextColor = Colors.text;
  const sheetMutedTextColor = "rgba(223,226,235,0.68)";
  // These are all static — define once outside the component (see bottom of file)
  const activeControlIconColor = "#FFFFFF";
  const sideControlIconColor = "#FFFFFF";
  const selectedControlIconColor = Colors.primary;

  // Memoize control button base styles to avoid new objects every render
  const ctrlBtnBase = useMemo(
    () => ({
      width: controlButtonSize,
      height: controlButtonSize,
      borderRadius: controlButtonSize / 2,
    }),
    [controlButtonSize]
  );
  const playerIconBtnStyle = useMemo(
    () => ({ ...ctrlBtnBase, backgroundColor: "transparent", borderColor: "transparent" }),
    [ctrlBtnBase]
  );
  const songDetailActionBtnStyle = useMemo(
    () => ({
      width: songDetailActionSize,
      height: songDetailActionSize,
      borderRadius: songDetailActionSize / 2,
      backgroundColor: "transparent",
      borderColor: "transparent",
    }),
    [songDetailActionSize]
  );
  const songDetailDownloadBtnStyle = useMemo(
    () => ({
      width: songDetailActionSize,
      height: songDetailActionSize,
      borderRadius: songDetailActionSize / 2,
      padding: 0,
    }),
    [songDetailActionSize]
  );
  const prevNextBtnSizeStyle = useMemo(
    () => ({
      width: prevNextButtonSize,
      height: prevNextButtonSize,
      borderRadius: prevNextButtonSize / 2,
    }),
    [prevNextButtonSize]
  );

  const artCarouselGetItemLayout = useCallback(
    (_: ArtworkQueueItem[] | null | undefined, index: number) => ({
      length: artCarouselSnapInterval,
      offset: artCarouselSnapInterval * index,
      index,
    }),
    [artCarouselSnapInterval]
  );

  const handleQueueSongPress = useCallback(
    (song: Song) => {
      playSong(song, playingQueue);
    },
    [playSong, playingQueue]
  );

  const handleSkip = useCallback(
    (direction: "next" | "prev") => {
      if (direction === "next") {
        void nextSong();
      } else {
        void prevSong();
      }
    },
    [nextSong, prevSong]
  );


  const showDevLoadMessage = useCallback((message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    Alert.alert("Player Dev Helper", message);
  }, []);

  const normalizePlayableSong = useCallback((source: Partial<Song> | null | undefined): Song | null => {
    if (!source?.id || !source.audioUrl || source.audioUrl.trim().length === 0) {
      return null;
    }

    return {
      id: source.id,
      title: source.title || "Unknown Song",
      artist: source.artist || "Unknown Artist",
      album: source.album || "",
      duration: Number(source.duration) || 0,
      coverUrl: source.coverUrl || "",
      genre: source.genre || "",
      audioUrl: source.audioUrl,
      year: source.year,
      language: source.language,
      source: source.source,
    };
  }, []);

  const handleLoadDevTrack = useCallback(async () => {
    if (isLoadingDevTrack) {
      return;
    }

    setIsLoadingDevTrack(true);
    try {
      const recentItems = await getRecentlyPlayed();
      const recentSongs = mapFilter(recentItems
        .filter((item) => item.type === "song"), (item) => normalizePlayableSong(item.data as Partial<Song> | undefined), (song): song is Song => Boolean(song));

      const localPlaylistSongs = mapFilter((await getUserPlaylists())
        .flatMap((playlist) => playlist.songs || []), (song) => normalizePlayableSong(song), (song): song is Song => Boolean(song));

      const candidateQueue = [recentSongs, localPlaylistSongs].find((songs) => songs.length > 0) || [];

      if (candidateQueue.length === 0) {
        showDevLoadMessage("No saved playable song found yet. Play one song from Home once, then come back here.");
        return;
      }

      playSong(candidateQueue[0], candidateQueue);
    } catch {
      showDevLoadMessage("Could not load a development test song.");
    } finally {
      setIsLoadingDevTrack(false);
    }
  }, [isLoadingDevTrack, normalizePlayableSong, playSong, showDevLoadMessage]);

  const openDevPreview = useCallback(() => {
    setIsDevPreviewEnabled(true);
    setDevPreviewIndex(0);
    setDevPreviewIsPlaying(true);
    setDevPreviewProgress(0.18);
    setDevPreviewIsShuffled(false);
    setDevPreviewRepeatMode("off");
    setDevPreviewLikedSongIds([]);
    setIsProgressSeeking(false);
  }, []);

  const handleArtworkSongChange = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= playingQueue.length || targetIndex === activeQueueIndex) {
        return;
      }

      if (isDevPreviewActive) {
        setDevPreviewIndex(targetIndex);
        setDevPreviewProgress(0.18);
        return;
      }

      if (targetIndex === activeQueueIndex + 1) {
        void nextSong();
        return;
      }

      if (targetIndex === activeQueueIndex - 1) {
        void prevSong();
        return;
      }

      const targetSong = playingQueue[targetIndex];
      if (!targetSong) {
        return;
      }

      playSong(targetSong, playingQueue);
    },
    [activeQueueIndex, isDevPreviewActive, nextSong, playSong, playingQueue, prevSong]
  );

  const handlePlayerAdToggle = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();

    if (showAdInPlayer) {
      playerAdCoverCooldownUntilRef.current = Date.now() + PLAYER_AD_COVER_COOLDOWN_MS;
      playerAdSongsSinceCoverRef.current = 0;
      setManualPlayerAdSongId(null);
      return;
    }

    setManualPlayerAdSongId(currentPlayerAdSongId);
  }, [currentPlayerAdSongId, showAdInPlayer]);

  useEffect(() => {
    pendingArtworkTargetIndexRef.current = activeQueueIndex;
  }, [activeQueueIndex]);

  const handleArtworkScrollFinished = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (playingQueue.length <= 1 || artCarouselSnapInterval <= 0) {
        return;
      }

      const rawIndex = Math.round(event.nativeEvent.contentOffset.x / artCarouselSnapInterval);
      const targetIndex = Math.max(0, Math.min(rawIndex, playingQueue.length - 1));

      if (
        targetIndex === activeQueueIndex ||
        targetIndex === pendingArtworkTargetIndexRef.current
      ) {
        return;
      }

      pendingArtworkTargetIndexRef.current = targetIndex;
      handleArtworkSongChange(targetIndex);
    },
    [activeQueueIndex, artCarouselSnapInterval, handleArtworkSongChange, playingQueue.length]
  );

  const handleArtworkScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: artScrollX } } }], {
        useNativeDriver: true,
      }),
    [artScrollX]
  );

  const handlePlayerScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);
    playerScrollOffsetYRef.current = offsetY;
    playerScrollOffsetYShared.value = offsetY;
    setPlayerDismissGestureEnabled(offsetY <= PLAYER_DISMISS_TOP_OFFSET_PX);
  }, [playerScrollOffsetYShared, setPlayerDismissGestureEnabled]);

  const lockQueueScroll = useCallback(() => {
    if (!queueCanScroll) return;
    if (queueTouchReleaseTimerRef.current) {
      clearTimeout(queueTouchReleaseTimerRef.current);
      queueTouchReleaseTimerRef.current = null;
    }
    setPlayerDismissGestureEnabled(false);
  }, [queueCanScroll, setPlayerDismissGestureEnabled]);

  const releaseQueueScroll = useCallback(() => {
    if (queueTouchReleaseTimerRef.current) {
      clearTimeout(queueTouchReleaseTimerRef.current);
      queueTouchReleaseTimerRef.current = null;
    }
    setPlayerDismissGestureEnabled(playerScrollOffsetYRef.current <= PLAYER_DISMISS_TOP_OFFSET_PX);
  }, [setPlayerDismissGestureEnabled]);

  const scheduleQueueScrollRelease = useCallback(() => {
    if (queueTouchReleaseTimerRef.current) {
      clearTimeout(queueTouchReleaseTimerRef.current);
    }
    queueTouchReleaseTimerRef.current = setTimeout(() => {
      queueTouchReleaseTimerRef.current = null;
      releaseQueueScroll();
    }, 700);
  }, [releaseQueueScroll]);

  const handleQueueScrollEndDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const velocityY = Math.abs(event.nativeEvent.velocity?.y ?? 0);
    if (velocityY < 0.05) {
      releaseQueueScroll();
    } else {
      scheduleQueueScrollRelease();
    }
  }, [releaseQueueScroll, scheduleQueueScrollRelease]);

  const finishPlayerGestureDismiss = useCallback(() => {
    if (didHandleSheetDismissRef.current) {
      return;
    }
    didHandleSheetDismissRef.current = true;
    safeGoBack();
  }, []);


  const playerPrimaryDismissGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isProgressSeeking)
        .activeOffsetY([-100000, PLAYER_PRIMARY_DISMISS_START_PX])
        .failOffsetX([-PLAYER_PRIMARY_DISMISS_FAIL_X_PX, PLAYER_PRIMARY_DISMISS_FAIL_X_PX])
        .onBegin(() => {
          if (
            playerDismissGestureEnabledShared.value <= 0 &&
            playerScrollOffsetYShared.value <= PLAYER_DISMISS_TOP_OFFSET_PX
          ) {
            playerDismissGestureEnabledShared.value = 1;
          }
          playerDismissTranslateY.value = 0;
        })
        .onUpdate((event) => {
          const canDismissFromTop =
            playerScrollOffsetYShared.value <= PLAYER_DISMISS_TOP_OFFSET_PX &&
            event.translationY > 0;
          if (playerDismissGestureEnabledShared.value <= 0 && canDismissFromTop) {
            playerDismissGestureEnabledShared.value = 1;
          }

          if (playerDismissGestureEnabledShared.value <= 0) {
            playerDismissTranslateY.value = 0;
            return;
          }

          const rawTranslateY = Math.max(0, event.translationY);
          const maxDrag = Math.max(120, screenHeight * PLAYER_PRIMARY_DISMISS_MAX_DRAG_RATIO);
          const resistedTranslateY =
            rawTranslateY > maxDrag
              ? maxDrag + (rawTranslateY - maxDrag) * 0.18
              : rawTranslateY;

          playerDismissTranslateY.value = resistedTranslateY;
        })
        .onEnd((event) => {
          const canDismissFromTop =
            playerScrollOffsetYShared.value <= PLAYER_DISMISS_TOP_OFFSET_PX &&
            event.translationY > 0;
          if (playerDismissGestureEnabledShared.value <= 0 && canDismissFromTop) {
            playerDismissGestureEnabledShared.value = 1;
          }

          if (playerDismissGestureEnabledShared.value <= 0) {
            playerDismissTranslateY.value = withSpring(0, PLAYER_PRIMARY_DISMISS_SPRING);
            return;
          }

          const horizontalDistance = Math.abs(event.translationX);
          const mostlyVertical = event.translationY > horizontalDistance * 1.08;
          const draggedFarEnough = event.translationY > PLAYER_PRIMARY_DISMISS_CLOSE_PX;
          const flickedDown =
            event.translationY > 28 &&
            event.velocityY > PLAYER_PRIMARY_DISMISS_FAST_VELOCITY;

          if (mostlyVertical && (draggedFarEnough || flickedDown)) {
            playerDismissGestureEnabledShared.value = 0;
            playerDismissTranslateY.value = withSpring(
              screenHeight + 40,
              {
                damping: 26,
                mass: 0.8,
                stiffness: 220,
                velocity: Math.max(0, event.velocityY || 0),
              },
              (finished) => {
                if (finished) {
                  runOnJS(finishPlayerGestureDismiss)();
                }
              }
            );
            return;
          }

          playerDismissTranslateY.value = withSpring(0, PLAYER_PRIMARY_DISMISS_SPRING);
        }),
    [
      finishPlayerGestureDismiss,
      isProgressSeeking,
      playerDismissGestureEnabledShared,
      playerScrollOffsetYShared,
      playerDismissTranslateY,
      screenHeight,
    ]
  );

  useEffect(() => {
    if (!artCarouselRef.current || artCarouselSnapInterval <= 0 || playingQueue.length === 0) {
      return;
    }

    const targetOffset = activeQueueIndex * artCarouselSnapInterval;
    const shouldAnimate = hasAlignedArtCarouselRef.current && playingQueue.length > 1;
    if (!shouldAnimate) {
      artScrollX.setValue(targetOffset);
    }
    const frame = requestAnimationFrame(() => {
      artCarouselRef.current?.scrollToOffset({
        offset: targetOffset,
        animated: shouldAnimate,
      });
      hasAlignedArtCarouselRef.current = true;
    });

    return () => cancelAnimationFrame(frame);
  }, [activeQueueIndex, artCarouselSnapInterval, artScrollX, playingQueue.length]);

  const renderArtworkCard = useCallback(
    ({ item, index }: { item: ArtworkQueueItem; index: number }) => {
      const song = item.song;
      const isActiveCard = index === activeQueueIndex;
      const isYouTubeTrack = song.id?.startsWith("youtube_") || song.source === "youtube";
      const isActiveYouTubeTrack = isYouTubeTrack && isActiveCard;
      const decor = getArtworkCardDecor(item.artworkKey);
      const inputRange = [
        (index - 1) * artCarouselSnapInterval,
        index * artCarouselSnapInterval,
        (index + 1) * artCarouselSnapInterval,
      ];
      const slideScale = artScrollX.interpolate({
        inputRange,
        outputRange: [0.96, 1, 0.96],
        extrapolate: "clamp",
      });
      const slideOpacity = artScrollX.interpolate({
        inputRange,
        outputRange: [0.78, 1, 0.78],
        extrapolate: "clamp",
      });
      const slideTranslateY = artScrollX.interpolate({
        inputRange,
        outputRange: [4, 0, 4],
        extrapolate: "clamp",
      });
      const slideTranslateX = artScrollX.interpolate({
        inputRange,
        outputRange: [8, 0, -8],
        extrapolate: "clamp",
      });
      const imageParallaxX = artScrollX.interpolate({
        inputRange,
        outputRange: [-4, 0, 4],
        extrapolate: "clamp",
      });

      // Active YouTube card only becomes a spacer while the video backdrop is actually visible.
      if (isActiveYouTubeTrack && ambientVideoLayoutActive) {
        return (
          <View
            key={item.artworkKey}
            style={{ width: artCarouselPageWidth, height: artSize }}
          />
        );
      }

      const cardContent = (
        <Pressable
          style={[styles.artCarouselTouch, { width: artCarouselPageWidth, height: artSize }]}
          onPress={() => handleArtworkSongChange(index)}
          disabled={isActiveCard}
        >
          <Animated.View
            style={[
              styles.artFrame,
              styles.artFrameDefault,
              styles.artCarouselCard,
              { width: artSize, height: artSize },
              {
                opacity: slideOpacity,
                boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
                transform: [
                  { translateX: slideTranslateX },
                  { translateY: slideTranslateY },
                  { scale: slideScale },
                ],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.albumArtParallax,
                {
                  transform: [
                    { scale: 1.06 },
                    { translateX: imageParallaxX },
                  ],
                },
              ]}
            >
              {showAdInPlayer && isScreenFocused && isActiveCard && playerAd && NativeAdView && NativeMediaView && NativeAsset && NativeAssetType ? (
                <NativeAdView
                  nativeAd={playerAd}
                  style={[styles.albumArt, styles.adCardContainer]}
                >
                  <NativeMediaView resizeMode="cover" style={styles.adCardMedia} />
                  
                  <View style={styles.adCardOverlay}>
                    <View style={styles.adCardTextWrap}>
                      <View style={styles.adCardBadgeRow}>
                        <View style={styles.adCardBadge}>
                          <Text style={styles.adCardBadgeText}>AD</Text>
                        </View>
                        <NativeAsset assetType={NativeAssetType.HEADLINE}>
                          <Text style={styles.adCardHeadline} numberOfLines={1}>
                            {playerAd.headline}
                          </Text>
                        </NativeAsset>
                      </View>
                      {playerAd.body && (
                        <NativeAsset assetType={NativeAssetType.BODY}>
                          <Text style={styles.adCardBody} numberOfLines={1}>
                            {playerAd.body}
                          </Text>
                        </NativeAsset>
                      )}
                    </View>
                    
                    {playerAd.callToAction && (
                      <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                        <Text style={styles.adCardCtaButton}>{playerAd.callToAction}</Text>
                      </NativeAsset>
                    )}
                  </View>
                </NativeAdView>
              ) : song.coverUrl?.trim() ? (
                <StableArtworkImage
                  uri={song.coverUrl.trim()}
                  recyclingKey={item.artworkKey}
                  priority={isActiveCard ? "high" : "normal"}
                />
              ) : (
                <View style={[styles.albumArt, styles.albumFallback]}>
                  <Ionicons name="musical-notes" size={58} color={Colors.subtext} />
                </View>
              )}
            </Animated.View>

            {/* Toggle ad/artwork overlay button */}
            {isActiveCard && !isLowEnd && playerAdLoaded && (
              <Pressable
                style={[
                  styles.adBadgeOverlay,
                  {
                    backgroundColor: showAdInPlayer ? "rgba(38, 225, 154, 0.9)" : "rgba(11, 13, 16, 0.82)",
                    borderColor: showAdInPlayer ? "#26e19a" : "rgba(255, 255, 255, 0.12)",
                  }
                ]}
                onPress={handlePlayerAdToggle}
              >
                <Ionicons
                  name={showAdInPlayer ? "image-outline" : "megaphone-outline"}
                  size={12}
                  color={showAdInPlayer ? "#10141a" : "#FFFFFF"}
                />
                <Text
                  style={[
                    styles.adBadgeText,
                    { color: showAdInPlayer ? "#10141a" : "#FFFFFF" }
                  ]}
                >
                  {showAdInPlayer ? "Show Cover" : "Show Ad"}
                </Text>
              </Pressable>
            )}

            {/* Perfect overlay border to prevent clipping/bleeding issues on Android/iOS */}
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  borderWidth: 1,
                  borderColor: isActiveCard
                    ? hexToRgba(playerTheme.accent, 0.54)
                    : hexToRgba(playerTheme.accent, decor.borderAlpha),
                  borderRadius: 16,
                  opacity: 1,
                },
              ]}
              pointerEvents="none"
            />
          </Animated.View>
        </Pressable>
      );

      if (isActiveCard) {
        return (
          <Reanimated.View style={[styles.activeCardReanimatedContainer, artworkDismissAnimatedStyle]}>
            {cardContent}
          </Reanimated.View>
        );
      }

      return cardContent;
    },
    [
      activeQueueIndex,
      ambientVideoLayoutActive,
      artCarouselPageWidth,
      artCarouselSnapInterval,
      artScrollX,
      artSize,
      handleArtworkSongChange,
      handlePlayerAdToggle,
      isLowEnd,
      isScreenFocused,
      NativeAdView,
      NativeAsset,
      NativeAssetType,
      NativeMediaView,
      playerTheme.accent,
      playerAd,
      playerAdLoaded,
      showAdInPlayer,
      artworkDismissAnimatedStyle,
    ]
  );

  const handleQueueItemPress = useCallback(
    (item: Song) => {
      if (isDevPreviewActive) {
        const idx = playingQueue.findIndex((s) => s.id === item.id);
        setDevPreviewIndex(idx >= 0 ? idx : 0);
        setDevPreviewProgress(0.18);
        return;
      }
      handleQueueSongPress(item);
    },
    [isDevPreviewActive, playingQueue, handleQueueSongPress]
  );
  const renderQueueItem = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <QueueSongRow
        item={item}
        index={index}
        isCurrent={index === activeQueueIndex}
        isShortScreen={isShortScreen}
        isPlaying={playerIsPlaying}
        onPress={handleQueueItemPress}
      />
    ),
    [activeQueueIndex, handleQueueItemPress, isShortScreen, playerIsPlaying]
  );

  const queueKeyExtractor = useCallback((item: Song, index: number) => {
    const baseKey = String(item.id || item.audioUrl || item.title || "queue-song");
    return `${baseKey}-${index}`;
  }, []);
  
  // Optimize queue FlatList performance with getItemLayout
  const getQueueItemLayout = useCallback(
    (_data: ArrayLike<Song> | null | undefined, index: number) => ({
      length: isShortScreen ? 56 : 64, // Approximate height of QueueSongRow
      offset: (isShortScreen ? 56 : 64) * index,
      index,
    }),
    [isShortScreen]
  );
  
  const renderPlayerScrollItem = useCallback(() => null, []);

  const handleExploreSongPress = useCallback(
    (song: Song) => {
      playSong(song, artistTopSongs);
    },
    [artistTopSongs, playSong]
  );

  const handleExploreArtistPress = useCallback(
    (artist: { id: string; name: string; image: string }) => {
      router.push(
        { pathname: "/artist/[id]", params: { id: artist.id, name: artist.name, image: artist.image } },
        { withAnchor: true, dangerouslySingular: () => "artist-profile" }
      );
    },
    []
  );

  const renderExploreItem = useCallback(
    ({ item }: { item: ArtistExploreItem }) => (
      <ArtistExploreTile
        item={item}
        fallbackCoverUrl={screenSong?.coverUrl || ""}
        onSongPress={handleExploreSongPress}
        onArtistPress={handleExploreArtistPress}
      />
    ),
    [handleExploreArtistPress, handleExploreSongPress, screenSong?.coverUrl]
  );


  if (!screenSong) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: topInset }]}>
        <View style={styles.emptyState}>
          <Ionicons name="musical-notes-outline" size={64} color={Colors.inactive} />
          <Text style={styles.emptyText}>No song playing</Text>
          {__DEV__ ? (
            <>
              <Text style={styles.emptyHint}>
                Development helper: load a saved recent, liked, or playlist song to test the player quickly.
              </Text>
              <Pressable
                onPress={() => {
                  void handleLoadDevTrack();
                }}
                style={styles.emptyDevButton}
              >
                {isLoadingDevTrack ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <>
                    <Ionicons name="play" size={16} color={Colors.text} />
                    <Text style={styles.emptyDevButtonText}>Load Dev Test Song</Text>
                  </>
                )}
              </Pressable>
              <Pressable onPress={openDevPreview} style={styles.emptyDevSecondaryButton}>
                <Ionicons name="eye-outline" size={16} color={Colors.text} />
                <Text style={styles.emptyDevSecondaryButtonText}>Open UI Preview</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable onPress={safeGoBack} style={styles.emptyBackButton}>
            <Ionicons name="arrow-down" size={26} color={Colors.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Reanimated.View
        style={[
          styles.backdropOverlay,
          backdropAnimatedStyle,
        ]}
      />
      <Reanimated.View style={[styles.playerSheetSurface, playerDismissAnimatedStyle]}>
        <Reanimated.View style={[StyleSheet.absoluteFillObject, bgOpacityAnimatedStyle]}>
          <CinematicPlayerBackground
            colors={gradientColors}
            coverUrl={screenSong.coverUrl || ""}
          />
        </Reanimated.View>

      <View style={[styles.playerForeground, { paddingBottom: 0 }]}>
      <Reanimated.View
        style={[
          styles.topBar,
          {
            position: "absolute",
            top: topInset,
            left: 0,
            right: 0,
            height: topBarHeight,
            paddingHorizontal: isShortScreen ? 14 : 18,
            zIndex: 10,
          },
          controlsDismissAnimatedStyle,
        ]}
      >
        <View style={styles.headerSideGroup}>
          <Pressable
            style={({ pressed }) => [
              styles.headerIconButton,
              pressed && styles.headerIconButtonPressed,
            ]}
            onPress={safeGoBack}
            hitSlop={10}
          >
            <Ionicons name="chevron-down" size={30} color={sheetTextColor} />
          </Pressable>
        </View>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerAlbum, { fontSize: isShortScreen ? 12 : 13 }]} numberOfLines={1}>
            {screenSong.album || "Single"}
          </Text>
        </View>

        <View style={[styles.headerSideGroup, styles.headerRightGroup]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open song options"
            style={({ pressed }) => [
              styles.headerIconButton,
              pressed && styles.headerIconButtonPressed,
            ]}
            onPress={handleSongOptionsPress}
            hitSlop={10}
          >
            <Ionicons name="ellipsis-horizontal" size={26} color={sheetTextColor} />
          </Pressable>
        </View>
      </Reanimated.View>

      <FlatList
        style={styles.playerScroll}
        data={EMPTY_PLAYER_SCROLL_SONGS}
        keyExtractor={(item) => item.id}
        renderItem={renderPlayerScrollItem}
        contentContainerStyle={[styles.playerScrollContent, { paddingBottom: listBottomPadding }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={Platform.OS === "android" ? !isProgressSeeking : true}
        keyboardShouldPersistTaps="handled"
        bounces={Platform.OS === "ios"}
        alwaysBounceVertical={Platform.OS === "ios"}
        overScrollMode="never"
        onScroll={handlePlayerScroll}
        onScrollBeginDrag={handlePlayerScroll}
        onScrollEndDrag={handlePlayerScroll}
        onMomentumScrollEnd={handlePlayerScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <>
            {shouldRenderBackgroundVideo ? (() => {
              // Cover upper 88% of screen, pushing playlist down to bottom 10-12%
              const containerH = Math.round(screenHeight * 0.88);
              return (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.backgroundYoutubeContainer,
                    {
                      height: containerH,
                      opacity: artScrollX.interpolate({
                        inputRange: [
                          (activeQueueIndex - 1) * artCarouselSnapInterval,
                          activeQueueIndex * artCarouselSnapInterval,
                          (activeQueueIndex + 1) * artCarouselSnapInterval,
                        ],
                        outputRange: [0, 1, 0],
                        extrapolate: "clamp",
                      }),
                    },
                  ]}
                >
                  <BackgroundYoutubeVideo
                    key={`bg-video-${backgroundVideoId}`}
                    videoId={backgroundVideoId!}
                    isPlaying={isScreenFocused}
                    positionMillis={positionMillis}
                    containerHeight={containerH}
                  />
                </Animated.View>
              );
            })() : null}
            <View
              style={[
                styles.playerContent,
                {
                  paddingTop: topInset + topBarHeight,
                  paddingBottom: isShortScreen ? 10 : 14,
                },
                ambientVideoLayoutActive && {
                  minHeight: screenHeight - topInset - (isShortScreen ? 70 : 90),
                  paddingBottom: 0,
                },
              ]}
            >
                <GestureDetector gesture={playerPrimaryDismissGesture}>
                  <View collapsable={false}>
                  <View
                    style={[
                      styles.playerPrimaryStack,
                      ambientVideoLayoutActive && { flex: 1 },
                    ]}
                  >
                <View
                  style={[
                    styles.artWrap,
                    {
                      marginTop: ambientVideoLayoutActive
                        ? isShortScreen ? 4 : 8
                        : isVeryShortScreen ? 8 : isShortScreen ? 12 : 18,
                      paddingHorizontal: 0,
                    },
                  ]}
                >
                  <AnimatedSongFlatList
                    ref={(list: any) => {
                      artCarouselRef.current = list as FlatList<ArtworkQueueItem> | null;
                    }}
                    data={artworkQueue}
                    keyExtractor={(item: ArtworkQueueItem) => item.artworkKey}
                    renderItem={renderArtworkCard}
                    horizontal
                    pagingEnabled={Platform.OS === "ios"}
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    scrollEnabled={playingQueue.length > 1 && !isProgressSeeking}
                    decelerationRate="fast"
                    disableIntervalMomentum
                    snapToAlignment="start"
                    snapToInterval={artCarouselSnapInterval}
                    contentContainerStyle={styles.artCarouselContent}
                    style={styles.artCarousel}
                    getItemLayout={artCarouselGetItemLayout}
                    initialNumToRender={3}
                    maxToRenderPerBatch={2}
                    windowSize={3}
                    updateCellsBatchingPeriod={80}
                    removeClippedSubviews={Platform.OS === "android"}
                    onScroll={handleArtworkScroll}
                    scrollEventThrottle={16}
                    onMomentumScrollEnd={handleArtworkScrollFinished}
                  />
                </View>

                {ambientVideoLayoutActive ? (
                  <View style={{ flex: 1 }} />
                ) : null}

                <Reanimated.View style={[{ flexGrow: 0 }, controlsDismissAnimatedStyle]}>
                  <View
                    style={[
                      styles.songBlock,
                      {
                        marginTop: ambientVideoLayoutActive
                          ? isShortScreen ? 95 : 120
                          : isVeryShortScreen ? 22 : isShortScreen ? 26 : 34,
                        marginHorizontal: isShortScreen ? 14 : 20,
                      },
                    ]}
                  >
                {/* Small album artwork on the left */}
                <Image
                  source={{ uri: screenSong.coverUrl || "" }}
                  style={styles.songBlockArtwork}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="memory-disk"
                />
                <View style={styles.songTextWrap}>
                  <PingPongScroll
                    text={screenSong.title}
                    style={[
                      styles.songTitle,
                      {
                        color: sheetTextColor,
                        fontSize: isVeryShortScreen ? 21 : isShortScreen ? 23 : 25,
                        lineHeight: isVeryShortScreen ? 25 : isShortScreen ? 27 : 30,
                      },
                    ]}
                    velocity={12}
                    paused={!interactionReady}
                  />
                  <PingPongScroll
                    text={screenSong.artist}
                    style={[
                      styles.songArtist,
                      {
                        color: sheetMutedTextColor,
                        fontSize: isVeryShortScreen ? 12 : 13,
                        lineHeight: isVeryShortScreen ? 16 : 18,
                      },
                    ]}
                    velocity={10}
                    paused={!interactionReady}
                  />
                  {screenSong.bitrateKbps ? (
                    <View style={styles.qualityContainer}>
                      <Text style={styles.qualityText}>
                        {screenSong.audioCodec && /opus/i.test(screenSong.audioCodec) ? "OPUS" : "AAC"} • {screenSong.bitrateKbps} KBPS
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.songDetailActions}>
                  <SmoothControlButton
                    style={[styles.songDetailActionButton, songDetailActionBtnStyle]}
                    onPress={() => {
                      if (isDevPreviewActive) {
                        setDevPreviewLikedSongIds((prev) =>
                          prev.includes(screenSong.id)
                            ? prev.filter((songId) => songId !== screenSong.id)
                            : [...prev, screenSong.id]
                        );
                        return;
                      }
                      toggleLike(screenSong);
                    }}
                  >
                    <Ionicons
                      name={liked ? "heart" : "heart-outline"}
                      size={songDetailIconSize}
                      color={liked ? selectedControlIconColor : "#FFFFFF"}
                    />
                  </SmoothControlButton>

                  {!screenSongIsYouTube ? (
                    <View style={[styles.songDetailActionButton, songDetailActionBtnStyle]}>
                      {isDevPreviewActive ? (
                        <Ionicons
                          name="download-outline"
                          size={songDetailIconSize}
                          color="rgba(236,240,247,0.28)"
                        />
                      ) : (
                        <DownloadButton
                          song={screenSong}
                          size={songDetailIconSize}
                          color="#FFFFFF"
                          style={[styles.playerDownloadButton, songDetailDownloadBtnStyle]}
                        />
                      )}
                    </View>
                  ) : null}
                </View>
              </View>
            </Reanimated.View>
            </View>

            <Reanimated.View style={controlsDismissAnimatedStyle}>
              <View style={styles.playerActionStack}>
              <PlayerSpotifyProgress
                screenSongId={screenSong.id}
                songDurationSeconds={screenSong.duration}
                isShortScreen={isShortScreen}
                isDevPreviewActive={isDevPreviewActive}
                devPreviewProgress={devPreviewProgress}
                setDevPreviewProgress={setDevPreviewProgress}
                seekTo={seekTo}
                onSeekingChange={setIsProgressSeeking}
              />

              <View
                style={[
                  styles.controlsRow,
                  {
                    marginTop: isShortScreen ? 6 : 8,
                    marginHorizontal: isShortScreen ? 14 : 20,
                    marginBottom: isShortScreen ? 6 : 8,
                    gap: controlsRowGap,
                  },
                ]}
              >
                <SmoothControlButton
                  style={[
                    styles.roundIconButton,
                    playerIconBtnStyle,
                  ]}
                  onPress={() => {
                    if (isDevPreviewActive) {
                      setDevPreviewIsShuffled((p) => !p);
                    } else {
                      toggleShuffle();
                    }
                  }}
                >
                  <Ionicons
                    name="shuffle"
                    size={shuffleRepeatIconSize}
                    color={sideControlIconColor}
                  />
                </SmoothControlButton>

                <SmoothControlButton
                  style={[styles.prevNextButton, prevNextBtnSizeStyle]}
                  onPressIn={() => {
                    if (isDevPreviewActive) {
                      setDevPreviewIndex((p) => Math.max(0, p - 1));
                      setDevPreviewProgress(0.18);
                    } else {
                      handleSkip("prev");
                    }
                  }}
                >
                  <Ionicons name="play-skip-back" size={prevNextIconSize} color={activeControlIconColor} />
                </SmoothControlButton>

                <PlayerPlayButton
                  isPlayingOverride={isDevPreviewActive ? devPreviewIsPlaying : undefined}
                  isLoadingOverride={isDevPreviewActive ? false : undefined}
                  buttonSize={playButtonSize}
                  iconSize={playIconSize}
                  onAccentColor="#060A0F"
                  onPress={() => {
                    if (isDevPreviewActive) {
                      setDevPreviewIsPlaying((p) => !p);
                    } else {
                      togglePlay();
                    }
                  }}
                />

                <SmoothControlButton
                  style={[styles.prevNextButton, prevNextBtnSizeStyle]}
                  onPressIn={() => {
                    if (isDevPreviewActive) {
                      setDevPreviewIndex((p) => Math.min(DEV_PREVIEW_SONGS.length - 1, p + 1));
                      setDevPreviewProgress(0.18);
                    } else {
                      handleSkip("next");
                    }
                  }}
                >
                  <Ionicons name="play-skip-forward" size={prevNextIconSize} color={activeControlIconColor} />
                </SmoothControlButton>

                <SmoothControlButton
                  style={[
                    styles.roundIconButton,
                    playerIconBtnStyle,
                  ]}
                  onPress={() => {
                    if (isDevPreviewActive) {
                      setDevPreviewRepeatMode((p) => (p === "off" ? "all" : p === "all" ? "one" : "off"));
                    } else {
                      toggleRepeat();
                    }
                  }}
                >
                  <Ionicons
                    name="repeat"
                    size={shuffleRepeatIconSize}
                    color={sideControlIconColor}
                  />
                  {playerRepeatMode === "one" && (
                    <Text style={[styles.repeatOneBadge, { color: sideControlIconColor }]}>1</Text>
                  )}
                </SmoothControlButton>
              </View>

            </View>
            </Reanimated.View>
                  </View>
                </GestureDetector>
          </View>

          <Reanimated.View style={controlsDismissAnimatedStyle}>
            <View
              style={[
                styles.playingListSection,
                {
                  marginTop: 0,
                  marginHorizontal: 0,
                  borderRadius: 0,
                  borderWidth: 0,
                  backgroundColor: "rgba(25,28,35,0.92)",
                },
            ]}
          >
            <View style={[styles.playingListHeader, isShortScreen && styles.playingListHeaderCompact]}>
              <Text style={styles.playingListTitle}>Queue</Text>
            </View>
            <FlatList
              data={playingQueue}
              keyExtractor={queueKeyExtractor}
              renderItem={renderQueueItem}
              getItemLayout={getQueueItemLayout}
              style={[styles.queueListViewport, queueViewportStyle]}
              scrollEnabled={queueCanScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.queueListContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              bounces={false}
              overScrollMode="never"
              onTouchStart={lockQueueScroll}
              onTouchEnd={releaseQueueScroll}
              onTouchCancel={releaseQueueScroll}
              onScrollBeginDrag={lockQueueScroll}
              onScrollEndDrag={handleQueueScrollEndDrag}
              onMomentumScrollBegin={lockQueueScroll}
              onMomentumScrollEnd={releaseQueueScroll}
              scrollEventThrottle={16}
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              updateCellsBatchingPeriod={50}
              windowSize={8}
              removeClippedSubviews={true}
            />
          </View>
          </Reanimated.View>
          </>
        }
        ListFooterComponent={
          <Reanimated.View style={controlsDismissAnimatedStyle}>

      {/* ── About the artist ── */}
      {artistInfo && !isDevPreviewActive ? (
        <View style={styles.spotifyCard}>
          <Pressable
            onPress={() => {
              const img = artistInfo.image?.length ? getBestImageUrl(artistInfo.image) : "";
              router.push(
                { pathname: "/artist/[id]", params: { id: artistInfo.id, name: artistInfo.name, image: img } },
                { withAnchor: true, dangerouslySingular: () => "artist-profile" }
              );
            }}
          >
            <View style={styles.artistHero}>
              <Image
                source={{ uri: artistInfo.image?.length ? getBestImageUrl(artistInfo.image) : screenSong.coverUrl || undefined }}
                style={styles.artistHeroImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.62)"]}
                style={styles.artistHeroShade}
              />
            </View>
          </Pressable>

          <View style={styles.artistCardBody}>
            <View style={styles.artistRankRow}>
              <Text style={styles.artistRankText}>
                {artistInfo.dominantLanguage ? `${artistInfo.dominantLanguage} artist` : "Featured artist"}
              </Text>
              <Pressable
                style={[styles.artistFollowBtn, artistFollowing && styles.artistFollowBtnActive]}
                onPress={handleArtistFollowPress}
              >
                <Text
                  style={[
                    styles.artistFollowBtnText,
                    artistFollowing && styles.artistFollowBtnTextActive,
                  ]}
                >
                  {artistFollowing ? "Following" : "Follow"}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => {
                const img = artistInfo.image?.length ? getBestImageUrl(artistInfo.image) : "";
                router.push(
                  { pathname: "/artist/[id]", params: { id: artistInfo.id, name: artistInfo.name, image: img } },
                  { withAnchor: true, dangerouslySingular: () => "artist-profile" }
                );
              }}
            >
              <View style={styles.artistNameRow}>
                <Text style={styles.artistCardName} numberOfLines={1}>{artistInfo.name}</Text>
                {artistInfo.isVerified ? (
                  <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                ) : null}
              </View>
              {artistInfo.followerCount ? (
                <Text style={styles.artistListeners}>
                  {artistInfo.followerCount >= 1_000_000
                    ? `${(artistInfo.followerCount / 1_000_000).toFixed(1)}M followers`
                    : artistInfo.followerCount >= 1_000
                    ? `${(artistInfo.followerCount / 1_000).toFixed(0)}K followers`
                    : `${artistInfo.followerCount} followers`}
                </Text>
              ) : null}
              {artistInfo.bio?.length ? (
                <Text style={styles.artistBio} numberOfLines={3}>
                  {artistInfo.bio[0]?.text?.replace(/<[^>]*>/g, "").trim() ?? ""}
                </Text>
              ) : null}
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* ── Explore ── */}
      {artistInfo && !isDevPreviewActive && artistExploreItems.length > 0 ? (
        <View style={styles.spotifyCard}>
          <View style={styles.exploreHeader}>
            <Text style={styles.exploreTitle}>Explore {artistInfo.name}</Text>
          </View>

          <FlatList
            data={artistExploreItems}
            keyExtractor={(item) => item.id}
            renderItem={renderExploreItem}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.exploreTileRow}
          />
        </View>
      ) : null}

      {artistInfo && !isDevPreviewActive ? (
        <View style={styles.spotifyCard}>
          <View style={styles.creditsHeader}>
            <Text style={styles.creditsTitle}>Credits</Text>
            <Text style={styles.creditsShowAll}>Show all</Text>
          </View>
          <View style={styles.creditPersonRow}>
            <View style={styles.creditPersonText}>
              <Text style={styles.creditPersonName}>{artistInfo.name}</Text>
              <Text style={styles.creditPersonRole}>Main Artist</Text>
            </View>
            <Pressable
              style={[styles.artistFollowBtn, artistFollowing && styles.artistFollowBtnActive]}
              onPress={handleArtistFollowPress}
            >
              <Text
                style={[
                  styles.artistFollowBtnText,
                  artistFollowing && styles.artistFollowBtnTextActive,
                ]}
              >
                {artistFollowing ? "Following" : "Follow"}
              </Text>
            </Pressable>
          </View>
          {screenSong.album ? (
            <View style={styles.creditPersonRow}>
              <View style={styles.creditPersonText}>
                <Text style={styles.creditPersonName}>{screenSong.album}</Text>
                <Text style={styles.creditPersonRole}>Album</Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
          </Reanimated.View>
        }
      />

      </View>
      </Reanimated.View>
    </View>
  );
}

export default function PlayerScreen() {
  const { fromQueue } = useLocalSearchParams<{ fromQueue?: string }>();

  useEffect(() => {
    if (fromQueue !== "true") {
      globalQueueSheetRef.current?.close();
    }
  }, [fromQueue]);

  return <LegacyPlayerScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  playerSheetSurface: {
    flex: 1,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.54)",
  },
  activeCardReanimatedContainer: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#070A10",
    overflow: "hidden",
  },
  backgroundYoutubeContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    zIndex: -1,
  },
  backgroundArtworkImage: {
    position: "absolute",
    top: -96,
    right: -96,
    bottom: -96,
    left: -96,
    opacity: 0.36,
    transform: [{ scale: 1.18 }],
  },
  backgroundColorWash: {
    opacity: 0.2,
  },

  playerForeground: {
    flex: 1,
  },
  topBar: {
    height: 54,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  playerScroll: {
    flex: 1,
  },
  playerScrollContent: {
    paddingBottom: 20,
    position: "relative",
  },
  playerContent: {
    flexGrow: 0,
  },
  playerPrimaryStack: {
    flexGrow: 0,
  },
  playerActionStack: {
    flexGrow: 0,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  headerIconButtonPressed: {
    opacity: 0.58,
  },
  headerSideGroup: {
    width: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerRightGroup: {
    justifyContent: "flex-end",
  },

  headerCenter: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },

  headerCaption: {
    color: Colors.subtext,
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  headerAlbum: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  artWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
    marginTop: 8,
  },
  artCarousel: {
    width: "100%",
    overflow: "visible",
  },
  artCarouselContent: {
    alignItems: "center",
  },
  artCarouselTouch: {
    alignItems: "center",
    justifyContent: "center",
  },
  artCarouselCard: {
    alignSelf: "center",
  },
  artFrame: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(223,226,235,0.08)",
    boxShadow: "none",
  },
  artFrameDefault: {
    borderRadius: 16,
  },
  youtubeArtFrame: {
    borderRadius: 0,
    backgroundColor: "#000000",
  },
  albumArt: {
    width: "100%",
    height: "100%",
  },
  albumArtLayer: {
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(10,14,20,0.92)",
  },
  albumArtParallax: {
    width: "100%",
    height: "100%",
  },
  albumFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  youtubeVideoFrame: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
    overflow: "hidden",
  },
  youtubeDetailPlayer: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000000",
    overflow: "hidden",
  },
  youtubeDetailIframe: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000000",
  },
  youtubeDetailShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  youtubeDetailLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  adCardContainer: {
    backgroundColor: "#11141a",
    overflow: "hidden",
    position: "relative",
  },
  adCardMedia: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000000",
  },
  adCardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(17, 20, 26, 0.82)",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  adCardTextWrap: {
    flex: 1,
    gap: 2,
  },
  adCardBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  adCardBadge: {
    backgroundColor: "rgba(38, 225, 154, 0.15)",
    borderWidth: 0.5,
    borderColor: "#26e19a",
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  adCardBadgeText: {
    color: "#26e19a",
    fontSize: 7.5,
    fontFamily: "Inter_700Bold",
  },
  adCardHeadline: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  adCardBody: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  adCardCtaButton: {
    color: "#10141a",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    backgroundColor: "#26e19a",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    overflow: "hidden",
    textAlign: "center",
  },
  adBadgeOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
    borderRadius: 12,
    borderWidth: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  adBadgeText: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
  },
  songBlock: {
    marginTop: 18,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  songBlockCompact: {
    marginTop: 10,
  },
  songBlockArtwork: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: "rgba(223,226,235,0.08)",
  },
  songTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  songDetailActions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
  },
  songDetailActionButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  songTitle: {
    color: Colors.text,
    fontSize: 25,
    lineHeight: 30,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0,
  },
  songTitleCompact: {
    fontSize: 23,
    lineHeight: 27,
  },
  songArtist: {
    marginTop: 2,
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
  },
  songArtistCompact: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  likeButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    flexShrink: 0,
    overflow: "hidden",
  },

  spotifyProgressWrap: {
    marginTop: 14,
    marginHorizontal: 20,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  playerSlider: {
    width: "100%",
    height: PLAYER_SLIDER_TOUCH_HEIGHT,
    marginVertical: 4,
    justifyContent: "center",
    position: "relative",
  },
  playerSliderDisabled: {
    opacity: 0.7,
  },
  playerSliderTrack: {
    width: "100%",
    height: 4,
    borderRadius: 999,
    backgroundColor: PLAYER_SLIDER_MAXIMUM_TRACK_COLOR,
    overflow: "hidden",
  },
  playerSliderFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
    backgroundColor: PLAYER_SLIDER_MINIMUM_TRACK_COLOR,
  },
  playerSliderThumb: {
    position: "absolute",
    left: 0,
    top: (PLAYER_SLIDER_TOUCH_HEIGHT - PLAYER_SLIDER_THUMB_SIZE) / 2,
    width: PLAYER_SLIDER_THUMB_SIZE,
    height: PLAYER_SLIDER_THUMB_SIZE,
    borderRadius: PLAYER_SLIDER_THUMB_SIZE / 2,
    backgroundColor: PLAYER_SLIDER_THUMB_COLOR,
  },
  spotifyTimeRow: {
    marginTop: 2,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  spotifyTimeText: {
    color: "rgba(247,250,255,0.62)",
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0,
  },

  controlsRow: {
    marginTop: 12,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  controlsRowCompact: {
    marginTop: 0,
  },
  utilityControlButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  bottomUtilityRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomUtilityButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  playerDownloadButton: {
    width: 38,
    height: 38,
    padding: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  playingListSection: {
    overflow: "hidden",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    backgroundColor: "rgba(20,23,30,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  queueListContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  queueListViewport: {
    flexGrow: 0,
  },

  playingListHeader: {
    height: 48,
    paddingHorizontal: 20,
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playingListHeaderCompact: {
    height: 40,
  },
  playingListHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 72,
    gap: 8,
  },
  playingListTitle: {
    color: Colors.text,
    fontSize: 25,
    lineHeight: 30,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0,
  },

  playingListCount: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },

  queueRow: {
    height: 54,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(223,226,235,0.09)",
  },
  queueRowActive: {
    backgroundColor: "rgba(223,226,235,0.055)",
    borderRadius: 10,
    borderBottomColor: "transparent",
  },
  queueRowCompact: {
    height: 48,
    gap: 8,
  },
  queueLead: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  queueIndex: {
    color: Colors.inactive,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  queueThumb: {
    width: 38,
    height: 38,
    borderRadius: 7,
    backgroundColor: Colors.surfaceLight,
  },
  queueThumbCompact: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
  },
  queueTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  queueTitle: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  queueTitleActive: {
    color: "#F7FAFF",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  queueMeta: {
    marginTop: 1,
    color: "rgba(223,226,235,0.58)",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  queueMetaActive: {
    marginTop: 1,
    color: "rgba(223,226,235,0.75)",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  queueDuration: {
    color: "rgba(223,226,235,0.5)",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    width: 34,
    textAlign: "right",
  },
  queueDurationActive: {
    color: "rgba(223,226,235,0.8)",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    width: 34,
    textAlign: "right",
  },

  roundIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    position: "relative",
    flexShrink: 0,
    overflow: "hidden",
  },
  quickButtonPressed: {
    opacity: 0.58,
  },
  prevNextButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    position: "relative",
    flexShrink: 0,
    overflow: "hidden",
  },
  roundIconButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(37, 201, 231, 0.14)",
  },
  playButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F7FB",
    boxShadow: "none",
    flexShrink: 0,
    overflow: "hidden",
  },
  repeatOneBadge: {
    position: "absolute",
    bottom: 5,
    right: 7,
    color: Colors.primary,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  emptyText: {
    color: Colors.subtext,
    fontSize: 18,
    fontFamily: "Inter_500Medium",
  },
  emptyHint: {
    maxWidth: 280,
    color: Colors.inactive,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },
  emptyDevButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  emptyDevButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  emptyDevSecondaryButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emptyDevSecondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  emptyBackButton: {
    marginTop: 8,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },

  // ── About the artist / Explore / Credits ────────────────────────────────────
  spotifyCard: {
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(36,36,36,0.94)",
  },
  infoCard: {
    marginHorizontal: 20,
    marginTop: 24,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(223,226,235,0.12)",
  },

  trackDetailsCard: {
    backgroundColor: "transparent",
  },
  trackDetailsHeader: {
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  trackDetailsTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  trackDetailsIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(223,226,235,0.06)",
  },
  trackDetailsTitleText: {
    flex: 1,
    minWidth: 0,
  },
  trackDetailsTitle: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
  },
  trackDetailsSubtitle: {
    marginTop: 2,
    color: "rgba(223,226,235,0.52)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  trackIdentityPanel: {
    minHeight: 70,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(223,226,235,0.1)",
  },
  trackIdentityArt: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: "rgba(223,226,235,0.08)",
  },
  trackIdentityText: {
    flex: 1,
    minWidth: 0,
  },
  trackIdentityTitle: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
  },
  trackIdentityArtist: {
    marginTop: 3,
    color: "rgba(223,226,235,0.62)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  trackMetaHeader: {
    marginTop: 18,
    marginBottom: 4,
  },
  infoCardLabel: {
    color: "rgba(223,226,235,0.5)",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    marginBottom: 14,
  },

  trackDetailsLabel: {
    marginBottom: 0,
  },
  // Artist row
  artistInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  artistInfoAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surface,
    flexShrink: 0,
  },
  artistInfoAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  artistInfoMeta: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  artistInfoName: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },

  artistInfoSub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  artistFollowBtn: {
    height: 30,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  artistFollowBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  artistFollowBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },

  artistFollowBtnTextActive: {
    color: "#000",
  },
  artistBio: {
    marginTop: 18,
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  artistHero: {
    height: 220,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  artistHeroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  artistHeroShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
  },
  artistCardBody: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 28,
  },
  artistRankRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  artistRankText: {
    flex: 1,
    minWidth: 0,
    color: "rgba(255,255,255,0.86)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textTransform: "capitalize",
  },
  artistNameRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  artistCardName: {
    color: "#FFFFFF",
    fontSize: 25,
    lineHeight: 31,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
    flexShrink: 1,
  },
  artistListeners: {
    marginTop: 6,
    color: "rgba(255,255,255,0.66)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  exploreHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 28,
    paddingTop: 28,
  },
  exploreTitle: {
    color: Colors.text,
    fontSize: 21,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
  },
  exploreTileRow: {
    gap: 16,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 30,
  },
  exploreTile: {
    width: 152,
    height: 216,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  exploreTileImage: {
    width: "100%",
    height: "100%",
  },
  exploreTileShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 112,
  },
  exploreTileText: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 14,
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 21,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
  },
  exploreTileEyebrow: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 60,
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  creditsHeader: {
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  creditsTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
  },
  creditsShowAll: {
    color: Colors.primary,
    fontSize: 15,
    fontFamily: "Inter_800ExtraBold",
  },
  creditPersonRow: {
    minHeight: 66,
    paddingHorizontal: 28,
    paddingBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  creditPersonText: {
    flex: 1,
    minWidth: 0,
  },
  creditPersonName: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 25,
    fontFamily: "Inter_500Medium",
  },
  creditPersonRole: {
    marginTop: 5,
    color: "rgba(255,255,255,0.62)",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },


  // Credits grid
  creditsGrid: {
    gap: 0,
  },
  creditItem: {
    minHeight: 46,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(223,226,235,0.1)",
  },
  creditLabel: {
    width: 82,
    color: "rgba(223,226,235,0.48)",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    flexShrink: 0,
  },
  creditValueWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  creditValue: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  creditValueCapitalized: {
    textTransform: "capitalize",
  },
  qualityContainer: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    marginTop: 4,
  },
  qualityText: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
});
