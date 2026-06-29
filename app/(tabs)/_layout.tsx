import { Redirect, Tabs, usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Animated from "@/lib/nativeAnimated";
import { Easing, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type DimensionValue } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import { usePlayerActions, usePlayerProgress } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/lib/playbackEngine";
import { PingPongScroll } from "@/components/PingPongScroll";
import {
  extractDominantColor,
  getImmediateArtworkColor,
  preloadDominantColors,
} from "@/lib/colorExtractor";
import { useLastMix, clearLastMix } from "@/lib/lastMix";
import { compactMap, mapFilter } from "@/lib/arrayUtils";
import { globalQueueSheetRef } from "@/lib/queueRef";
import { useAuth } from "@/contexts/AuthContext";
import { globalPlayerDetailsVisibleRef } from "@/lib/playerModalRef";

const MIX_DELETE_THRESHOLD = -72;

type NativeTabsModule = typeof import("expo-router/unstable-native-tabs");

let nativeTabsModule: NativeTabsModule | null = null;

function getNativeTabsModule(): NativeTabsModule {
  if (!nativeTabsModule) {
    // Native tabs can terminate sideloaded iOS builds during startup, so only
    // resolve the module when the fallback is intentionally disabled.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeTabsModule = require("expo-router/unstable-native-tabs") as NativeTabsModule;
  }

  return nativeTabsModule;
}

function colorToRgba(input: string | undefined, alpha: number, fallback: string): string {
  if (!input) return fallback;
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const value = input.trim();
  const hex = value.replace("#", "");

  if (hex.length === 3) {
    const r = Number.parseInt(hex[0] + hex[0], 16);
    const g = Number.parseInt(hex[1] + hex[1], 16);
    const b = Number.parseInt(hex[2] + hex[2], 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r},${g},${b},${safeAlpha})`;
    }
  }

  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r},${g},${b},${safeAlpha})`;
    }
  }

  const rgb = value.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
  if (rgb) {
    const r = Number.parseInt(rgb[1], 10);
    const g = Number.parseInt(rgb[2], 10);
    const b = Number.parseInt(rgb[3], 10);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r},${g},${b},${safeAlpha})`;
    }
  }

  return fallback;
}

function toProgressWidth(progress: number): DimensionValue {
  return `${Math.max(0, Math.min(100, (Number.isFinite(progress) ? progress : 0) * 100))}%`;
}

function getCandyColors(baseHex: string | null | undefined): { bg: string; accent: string; border: string } {
  const defaultRes = { bg: "#1E222D", accent: "#26E19A", border: "rgba(38, 225, 154, 0.72)" };
  if (!baseHex) return defaultRes;

  const hex = baseHex.trim().replace("#", "");
  let r = 0, g = 0, b = 0;
  if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else {
    return defaultRes;
  }

  // RGB to HSL
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));



  // Boost to a vibrant, shiny candy color (high saturation, bright candy lightness)
  const candyS = s < 0.1 ? 0 : Math.min(0.95, Math.max(0.75, s * 1.4));
  const candyL = s < 0.1 ? 0.8 : 0.52;

  const c = (1 - Math.abs(2 * candyL - 1)) * candyS;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = candyL - c / 2;
  let rCandy = 0, gCandy = 0, bCandy = 0;
  if (h >= 0 && h < 60) {
    rCandy = c; gCandy = x;
  } else if (h < 120) {
    rCandy = x; gCandy = c;
  } else if (h < 180) {
    gCandy = c; bCandy = x;
  } else if (h < 240) {
    gCandy = x; bCandy = c;
  } else if (h < 300) {
    rCandy = x; bCandy = c;
  } else {
    rCandy = c; bCandy = x;
  }

  const rc = Math.round((rCandy + m) * 255);
  const gc = Math.round((gCandy + m) * 255);
  const bc = Math.round((bCandy + m) * 255);

  const toHexStr = (val: number) => Math.min(255, Math.max(0, val)).toString(16).padStart(2, "0").toUpperCase();
  const accent = `#${toHexStr(rc)}${toHexStr(gc)}${toHexStr(bc)}`;

  // Shiny dark background (blend 18% of the candy color with dark slate base '#0A0C10')
  const alpha = 0.18;
  const rBg = Math.round(rc * alpha + 10 * (1 - alpha));
  const gBg = Math.round(gc * alpha + 12 * (1 - alpha));
  const bBg = Math.round(bc * alpha + 16 * (1 - alpha));
  const bg = `#${toHexStr(rBg)}${toHexStr(gBg)}${toHexStr(bBg)}`;

  const border = `rgba(${rc},${gc},${bc},0.68)`;

  return { bg, accent, border };
}

const MiniPlayerProgressBar = React.memo(function MiniPlayerProgressBar({
  fillColor,
}: {
  fillColor: string;
}) {
  const { progress } = usePlayerProgress();
  const progressWidth = useMemo(() => toProgressWidth(progress), [progress]);

  return (
    <View pointerEvents="none" style={styles.playerProgressTrack}>
      <View
        style={[
          styles.playerProgressFill,
          {
            width: progressWidth,
            backgroundColor: fillColor,
          },
        ]}
      />
    </View>
  );
});

const IOSMiniPlayerProgressBar = React.memo(function IOSMiniPlayerProgressBar({
  fillColor,
}: {
  fillColor: string;
}) {
  const { progress } = usePlayerProgress();
  const progressWidth = useMemo(() => toProgressWidth(progress), [progress]);

  return (
    <View pointerEvents="none" style={styles.iosMiniPlayerProgressTrack}>
      <View
        style={[
          styles.iosMiniPlayerProgressFill,
          { width: progressWidth, backgroundColor: fillColor },
        ]}
      />
    </View>
  );
});

type VisibleRoute = "index" | "search" | "library" | "liked-songs" | "import-songs";

type NavItem = {
  route: VisibleRoute;
  label: string;
  icon: string;
  iconActive: string;
};

const NAV_ITEMS: NavItem[] = [
  { route: "index", label: "Home", icon: "home-outline", iconActive: "home-sharp" },
  { route: "search", label: "Search", icon: "search-outline", iconActive: "search-sharp" },
  { route: "library", label: "Library", icon: "library-outline", iconActive: "library-sharp" },
  { route: "liked-songs", label: "Liked", icon: "heart-outline", iconActive: "heart-sharp" },
  { route: "import-songs", label: "Import", icon: "cloud-upload-outline", iconActive: "cloud-upload" },
];
const noopLongPress = () => { };

const TAB_TRANSITION_SPEC = {
  animation: "timing" as const,
  config: {
    duration: 170,
    easing: Easing.out(Easing.cubic),
  },
};

function getTabHref(route: VisibleRoute) {
  return route === "index" ? "/" : `/${route}`;
}

function TabIcon({ route, name, size, color }: { route: VisibleRoute; name: string; size: number; color: string }) {
  if (route === "liked-songs") {
    const iconName = name.includes("sharp") || name.includes("heart") || name.includes("Active") || name === "heart-sharp"
      ? "favorite"
      : "favorite-border";
    return <MaterialIcons name={iconName as any} size={size} color={color} />;
  }
  if (route === "library") {
    const iconName = name.includes("sharp") || name.includes("library") || name.includes("Active") || name === "library-sharp"
      ? "music-box-multiple"
      : "music-box-multiple-outline";
    return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
  }
  if (route === "import-songs") {
    const iconName = name.includes("sharp") || name.includes("Active") || name === "cloud-upload"
      ? "cloud-upload"
      : "cloud-upload-outline";
    return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
  }
  return <Ionicons name={name as any} size={size} color={color} />;
}

type NavTabItemProps = {
  item: NavItem;
  isFocused: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  onPress: (route: VisibleRoute, isFocused: boolean) => void;
  onLongPress: () => void;
  navIconSize: number;
  navLabelSize: number;
  navLabelLineHeight: number;
  navItemPaddingTop: number;
  navItemPaddingBottom: number;
  activeNavColor: string;
  navInactiveColor: string;
};

function NavTabItem({
  item,
  isFocused,
  isAndroid,
  isIOS,
  onPress,
  onLongPress,
  navIconSize,
  navLabelSize,
  navLabelLineHeight,
  navItemPaddingTop,
  navItemPaddingBottom,
  activeNavColor,
  navInactiveColor,
}: NavTabItemProps) {
  const focusAnimRef = React.useRef<Animated.Value | null>(null);
  if (focusAnimRef.current === null) focusAnimRef.current = new Animated.Value(isFocused ? 1 : 0);
  const focusAnim = focusAnimRef.current;

  useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: isFocused ? 1 : 0,
      duration: 155,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    }).start();
  }, [focusAnim, isFocused]);

  const handlePress = React.useCallback(() => {
    onPress(item.route, isFocused);
  }, [isFocused, item.route, onPress]);

  const inactiveIconOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const activeIconOpacity = focusAnim;
  const activeIconScale = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.navItemAnimWrap}>
      <Pressable
        android_disableSound
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        onPress={handlePress}
        onLongPress={onLongPress}
        hitSlop={6}
        style={({ pressed }) => [
          styles.navItem,
          isIOS && styles.navItemIOS,
          { paddingTop: navItemPaddingTop, paddingBottom: navItemPaddingBottom },
          isFocused && styles.navItemActive,
          isFocused && isIOS && styles.navItemIOSActive,
          pressed && styles.navItemPressed,
        ]}
      >
        <View style={styles.navIconWrap}>
          <Animated.View style={[styles.navIconLayer, { opacity: inactiveIconOpacity }]}>
            <TabIcon route={item.route} name={item.icon} size={navIconSize} color={navInactiveColor} />
          </Animated.View>
          <Animated.View
            style={[
              styles.navIconLayer,
              {
                opacity: activeIconOpacity,
                transform: [{ scale: activeIconScale }],
              },
            ]}
          >
            <TabIcon route={item.route} name={item.iconActive} size={navIconSize} color={activeNavColor} />
          </Animated.View>
        </View>
        <Text
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          numberOfLines={1}
          style={[
            styles.navLabel,
            {
              fontSize: navLabelSize,
              lineHeight: navLabelLineHeight,
              marginTop: isAndroid ? 2 : 2,
              textAlignVertical: "center",
            },
            isIOS && styles.navLabelIOS,
            isFocused && styles.navLabelActive,
            isFocused && { color: activeNavColor },
          ]}
        >
          {item.label}
        </Text>
      </Pressable>
    </View>
  );
}

// Memoize NavTabItem to prevent unnecessary re-renders
const MemoizedNavTabItem = React.memo(NavTabItem, (prev, next) => {
  return (
    prev.isFocused === next.isFocused &&
    prev.item.route === next.item.route &&
    prev.isAndroid === next.isAndroid &&
    prev.isIOS === next.isIOS &&
    prev.navIconSize === next.navIconSize &&
    prev.navLabelSize === next.navLabelSize &&
    prev.navLabelLineHeight === next.navLabelLineHeight &&
    prev.navItemPaddingTop === next.navItemPaddingTop &&
    prev.navItemPaddingBottom === next.navItemPaddingBottom &&
    prev.activeNavColor === next.activeNavColor &&
    prev.navInactiveColor === next.navInactiveColor
  );
});

type AppNavBarProps = {
  hidden?: boolean;
};

export function AppNavBar(props: AppNavBarProps) {
  return useAppNavBarView(props);
}

function useAppNavBarView({ hidden = false }: AppNavBarProps) {
  const { push: routerPush, navigate: routerNavigate } = useRouter();
  const pathname = usePathname();
  const [playerModalVisible, setPlayerModalVisible] = useState(() => globalPlayerDetailsVisibleRef.current);
  useEffect(() => {
    return globalPlayerDetailsVisibleRef.subscribe((visible) => {
      setPlayerModalVisible(visible);
    });
  }, []);
  const [activeTab, setActiveTab] = useState<VisibleRoute>(() => {
    if (!pathname) return "index";
    if (pathname === "/" || pathname === "/index") return "index";
    if (pathname === "/search" || pathname.startsWith("/search/")) return "search";
    if (pathname === "/library" || pathname.startsWith("/library/")) return "library";
    if (pathname === "/liked-songs" || pathname.startsWith("/liked-songs/")) return "liked-songs";
    if (pathname === "/import-songs" || pathname.startsWith("/import-songs/") || pathname === "/import-songs-file" || pathname.startsWith("/import-songs-file")) return "import-songs";
    return "index";
  });

  useEffect(() => {
    if (!pathname) return;
    if (pathname === "/" || pathname === "/index") {
      setActiveTab("index");
    } else if (pathname === "/search" || pathname.startsWith("/search/")) {
      setActiveTab("search");
    } else if (pathname === "/library" || pathname.startsWith("/library/")) {
      setActiveTab("library");
    } else if (pathname === "/liked-songs" || pathname.startsWith("/liked-songs/")) {
      setActiveTab("liked-songs");
    } else if (pathname === "/import-songs" || pathname.startsWith("/import-songs/") || pathname === "/import-songs-file" || pathname.startsWith("/import-songs-file")) {
      setActiveTab("import-songs");
    }
  }, [pathname]);
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const safeInsets = useSafeAreaInsets();
  const bottomInset = Math.max(safeInsets.bottom ?? 0, 0);
  const { width } = useWindowDimensions();
  const isAndroid = Platform.OS === "android";
  const isNarrowMobile = !isWeb && width <= 380;
  const { currentSong, queue, queueIndex } = usePlaybackNowPlaying();
  const playbackState = usePlaybackPlayState();
  const {
    textColor,
    togglePlay,
    albumColor,
    setAlbumColor,
    setTextColor,
  } = usePlayerActions();
  const activeSong = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;
  const hasActiveMiniPlayer = Boolean(activeSong);
  const [coverFailed, setCoverFailed] = useState(false);
  const routePressLockRef = useRef({ href: "", time: 0 });
  const openPlayerLockRef = useRef(0);

  const handleTabPress = useCallback(
    (route: VisibleRoute, isFocused: boolean) => {
      if (isFocused) return;

      const href = getTabHref(route);
      const now = Date.now();
      const previous = routePressLockRef.current;
      if (previous.href === href && now - previous.time < 280) return;

      routePressLockRef.current = { href, time: now };
      routerNavigate(href as any);
    },
    [routerNavigate]
  );

  const openPlayer = useCallback(() => {
    const now = Date.now();
    if (now - openPlayerLockRef.current < 240) return;

    openPlayerLockRef.current = now;
    routerPush("/player");
  }, [routerPush]);

  useEffect(() => {
    const urls = mapFilter([
      queue[queueIndex - 1]?.coverUrl,
      activeSong?.coverUrl,
      queue[queueIndex + 1]?.coverUrl,
    ], (url) => url?.trim(), (url): url is string => Boolean(url));

    if (urls.length === 0) return;
    
    // Defer prefetching to avoid blocking navigation transitions
    const timer = setTimeout(() => {
      void Image.prefetch(urls, "memory-disk").catch(() => { });
      preloadDominantColors(urls);
    }, 350);
    
    return () => clearTimeout(timer);
  }, [activeSong?.coverUrl, queue, queueIndex]);

  const lastMix = useLastMix();
  const mixChipImages = useMemo(() => {
    const raw = lastMix?.images ?? "";
    if (!raw) return [] as string[];
    return compactMap(raw.split(","), (image) => image.trim());
  }, [lastMix?.images]);
  const openLastMix = useCallback(() => {
    if (!lastMix) return;
    routerPush({ pathname: "/artist-mix", params: lastMix });
  }, [lastMix, routerPush]);

  // ── Mix chip drag-to-delete ───────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const dragXRef = useRef<Animated.Value | null>(null);
  if (dragXRef.current === null) dragXRef.current = new Animated.Value(0);
  const dragX = dragXRef.current;
  const trashOpacityRef = useRef<Animated.Value | null>(null);
  if (trashOpacityRef.current === null) trashOpacityRef.current = new Animated.Value(0);
  const trashOpacity = trashOpacityRef.current;
  const chipScaleRef = useRef<Animated.Value | null>(null);
  if (chipScaleRef.current === null) chipScaleRef.current = new Animated.Value(1);
  const chipScale = chipScaleRef.current;
  const chipOpacityRef = useRef<Animated.Value | null>(null);
  if (chipOpacityRef.current === null) chipOpacityRef.current = new Animated.Value(1);
  const chipOpacity = chipOpacityRef.current;
  const coverOpacityRef = useRef<Animated.Value | null>(null);
  if (coverOpacityRef.current === null) coverOpacityRef.current = new Animated.Value(1);
  const coverOpacity = coverOpacityRef.current;

  useEffect(() => {
    Animated.timing(coverOpacity, {
      toValue: playerModalVisible ? 0 : 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [playerModalVisible, coverOpacity]);
  
  // Disable pointer events on artwork during player modal transitions
  const artworkPointerEvents = playerModalVisible ? "none" : "auto";

  const resetMixChip = useCallback(() => {
    Animated.parallel([
      Animated.spring(dragX, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 7 }),
      Animated.spring(chipScale, { toValue: 1, useNativeDriver: true, speed: 26, bounciness: 5 }),
      Animated.timing(chipOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(trashOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setIsDragging(false);
      setOverTrash(false);
    });
  }, [chipOpacity, chipScale, dragX, trashOpacity]);

  const startMixDrag = useCallback(() => {
    if (isDragging) return;
    dragX.setValue(0);
    chipOpacity.setValue(1);
    setOverTrash(false);
    setIsDragging(true);
    Animated.parallel([
      Animated.spring(chipScale, { toValue: 0.96, useNativeDriver: true, speed: 28, bounciness: 0 }),
      Animated.timing(trashOpacity, { toValue: 1, duration: 170, useNativeDriver: true }),
    ]).start();
  }, [chipOpacity, chipScale, dragX, isDragging, trashOpacity]);

  const deleteMixWithAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(dragX, { toValue: -150, duration: 170, useNativeDriver: true }),
      Animated.timing(chipScale, { toValue: 0.8, duration: 170, useNativeDriver: true }),
      Animated.timing(chipOpacity, { toValue: 0, duration: 170, useNativeDriver: true }),
      Animated.timing(trashOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setIsDragging(false);
      setOverTrash(false);
      dragX.setValue(0);
      chipScale.setValue(1);
      chipOpacity.setValue(1);
      clearLastMix();
    });
  }, [chipOpacity, chipScale, dragX, trashOpacity]);

  const mixDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isDragging)
        .runOnJS(true)
        .onUpdate((event) => {
          const nextDx = Math.max(-170, Math.min(12, event.translationX));
          dragX.setValue(nextDx);
          const nextOverTrash = nextDx <= MIX_DELETE_THRESHOLD;
          setOverTrash((prev) => (prev === nextOverTrash ? prev : nextOverTrash));
        })
        .onEnd((event) => {
          if (event.translationX <= MIX_DELETE_THRESHOLD) {
            deleteMixWithAnimation();
            return;
          }
          resetMixChip();
        }),
    [deleteMixWithAnimation, dragX, isDragging, resetMixChip]
  );

  const applyMiniPlayerColors = useCallback((primary: string, text: string) => {
    setAlbumColor(primary);
    setTextColor(text);
  }, [setAlbumColor, setTextColor]);

  useEffect(() => {
    if (!activeSong?.coverUrl) {
      applyMiniPlayerColors("#25282E", "#F5FBFF");
      return () => { };
    }
    let active = true;
    const immediateColors = getImmediateArtworkColor(activeSong.coverUrl);
    applyMiniPlayerColors(immediateColors.primary, immediateColors.text);

    // Defer to next frame to avoid blocking navigation
    requestAnimationFrame(() => {
      extractDominantColor(activeSong.coverUrl)
        .then((colors) => {
          if (!active) return;
          applyMiniPlayerColors(colors.primary, colors.text);
        })
        .catch(() => { });
    });

    return () => {
      active = false;
    };
  }, [activeSong?.id, activeSong?.coverUrl, applyMiniPlayerColors]);

  useEffect(() => {
    setCoverFailed(false);
  }, [activeSong?.id, activeSong?.coverUrl]);

  const resolvedBottomInset = isWeb ? 0 : Math.max(bottomInset, 0);
  const navIconSize = isNarrowMobile ? 20 : 22;
  const navLabelSize = isNarrowMobile ? 9 : 10;
  const navLabelLineHeight = 12;
  const navHorizontalPadding = isNarrowMobile ? 6 : 8;
  const navItemPaddingTop = 6;
  const navItemPaddingBottom = 4;
  const conceptText = "#dfe2eb";
  const conceptSubtext = "#bccbb9";

  // Ensure title is always readable — if extracted textColor is too dark, use white
  const safeTextColor = useMemo(() => {
    const raw = textColor || conceptText;
    const hex = raw.replace("#", "");
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness < 100) return conceptText;
    }
    return raw;
  }, [textColor]);

  const candyTheme = useMemo(() => {
    return getCandyColors(albumColor);
  }, [albumColor]);

  const playerTitleColor = safeTextColor;
  const playerSecondaryColor = useMemo(
    () => colorToRgba(safeTextColor, 0.72, conceptSubtext),
    [safeTextColor]
  );
  const playIconColor = "#FFFFFF";
  const playerSectionBg = candyTheme.bg;
  const activeNavColor = "#FFFFFF";
  const navInactiveColor = conceptSubtext;
  const navBaseBg = "#0E1016";
  const containerGlassBase = "#0E1016";
  const playerSectionDivider = useMemo(
    () => colorToRgba(candyTheme.accent, 0.14, "rgba(223,226,235,0.08)"),
    [candyTheme.accent]
  );
  const playerProgressFillColor = candyTheme.accent;


  const playerTopEdgeTint = useMemo(
    () => colorToRgba(candyTheme.accent, 0.18, "rgba(255,255,255,0.12)"),
    [candyTheme.accent]
  );
  const miniButtonPrimaryBg = "#1C1F26";
  const miniButtonPrimaryBorder = "rgba(255,255,255,0.12)";
  const miniSecondaryButtonBg = "#1C1F26";
  const miniSecondaryButtonBorder = "rgba(255,255,255,0.12)";
  const miniSecondaryIconColor = "#FFFFFF";
  const coverUrl = activeSong?.coverUrl?.trim();
  const miniPlayerHeight = 60;
  const miniCoverSlotSize = 48;
  const miniCoverSize = 48;
  const miniControlSize = 42;
  const miniControlRadius = Math.round(miniControlSize / 2);
  const trashShiftX = trashOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
    extrapolate: "clamp",
  });
  const trashShiftY = trashOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
    extrapolate: "clamp",
  });
  const trashScale = trashOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1],
    extrapolate: "clamp",
  });
  return (
    <>
      <View
        pointerEvents={hidden ? "none" : "box-none"}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
        style={[
          styles.wrapper,
          { bottom: 0 },
          hidden && styles.wrapperHidden,
        ]}
      >
        <View
          style={[
            styles.container,
            isIOS && styles.containerIOS,
            { width: "100%" },
            !hasActiveMiniPlayer && styles.containerNavOnly,
            !hasActiveMiniPlayer && isIOS && styles.containerNavOnlyIOS,
          ]}
        >
          <View pointerEvents="none" style={[styles.glassLayer, { backgroundColor: containerGlassBase }]} />

          {hasActiveMiniPlayer && activeSong ? (
            <View
              style={[
                styles.playerSection,
                isIOS && styles.playerSectionIOS,
                { backgroundColor: playerSectionBg, borderBottomColor: playerSectionDivider },
              ]}
            >

              <View pointerEvents="none" style={[styles.playerTopEdge, { backgroundColor: playerTopEdgeTint }]} />
              <View
                pointerEvents="none"
                style={[styles.playerCornerAccentLeft, { borderColor: playerTopEdgeTint }]}
              />
              <View
                pointerEvents="none"
                style={[styles.playerCornerAccentRight, { borderColor: playerTopEdgeTint }]}
              />
              <Pressable
                android_disableSound
                style={[styles.playerRow, { height: miniPlayerHeight }]}
                onPress={openPlayer}
              >
                <View style={styles.playerLeft}>
                  <Animated.View 
                    pointerEvents={artworkPointerEvents}
                    style={[styles.coverWrap, { width: miniCoverSlotSize, opacity: coverOpacity }]}
                  >
                    {coverUrl && !coverFailed ? (
                      <Image
                        source={{ uri: coverUrl }}
                        style={[
                          styles.cover,
                          { width: miniCoverSize, height: miniCoverSize },
                        ]}
                        contentFit="cover"
                        decodeFormat="argb"
                        transition={0}
                        onError={() => setCoverFailed(true)}
                      />
                    ) : (
                      <View
                        style={[
                          styles.cover,
                          styles.coverFallback,
                          { width: miniCoverSize, height: miniCoverSize },
                        ]}
                      >
                        <Ionicons name="musical-notes" size={20} color="rgba(255,255,255,0.72)" />
                      </View>
                    )}
                  </Animated.View>
                  <View style={[styles.songInfo, isDragging && styles.songInfoDuringMixDrag]}>
                    <PingPongScroll
                      text={activeSong.title}
                      style={[styles.songTitle, { color: playerTitleColor }]}
                      velocity={15}
                    />
                    <PingPongScroll
                      text={activeSong.artist}
                      style={[styles.songArtist, { color: playerSecondaryColor }]}
                      velocity={12}
                    />
                  </View>
                </View>

                <View style={styles.playerControls}>
                  {lastMix ? (
                    <GestureDetector gesture={mixDragGesture}>
                      <Animated.View
                        style={[
                          styles.mixChipWrap,
                          {
                            opacity: chipOpacity,
                            transform: [{ translateX: dragX }, { scale: chipScale }],
                          },
                        ]}
                      >
                        <Pressable
                          android_disableSound
                          onPress={openLastMix}
                          onLongPress={startMixDrag}
                          delayLongPress={280}
                          hitSlop={8}
                          style={[
                            styles.mixChip,
                            isDragging && styles.mixChipDragging,
                            overTrash && styles.mixChipDeleteReady,
                          ]}
                        >
                          <View style={styles.mixChipAvatars}>
                            {mixChipImages.slice(0, 3).map((image, index) => (
                              <Image
                                key={image}
                                source={{ uri: image }}
                                style={[
                                  styles.mixChipAvatar,
                                  index > 0 ? { marginLeft: -8 } : null,
                                ]}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                              />
                            ))}
                            {mixChipImages.length === 0 ? (
                              <View style={styles.mixChipAvatar}>
                                <Ionicons name="people" size={12} color="rgba(255,255,255,0.82)" />
                              </View>
                            ) : null}
                          </View>
                          <Ionicons
                            name={overTrash ? "trash" : "albums"}
                            size={16}
                            color={overTrash ? "#ff6b6b" : "rgba(255,255,255,0.9)"}
                          />
                        </Pressable>
                      </Animated.View>
                    </GestureDetector>
                  ) : null}
                  <Pressable
                    android_disableSound
                    onPress={() => globalQueueSheetRef.current?.expand()}
                    hitSlop={14}
                    style={({ pressed }) => [
                      {
                        width: miniControlSize,
                        height: miniControlSize,
                        borderRadius: miniControlRadius,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: miniSecondaryButtonBg,
                        borderWidth: 1,
                        borderColor: miniSecondaryButtonBorder,
                      },
                      pressed && styles.miniButtonPressed,
                    ]}
                  >
                    <Ionicons name="list" size={24} color={miniSecondaryIconColor} />
                  </Pressable>
                  <Pressable
                    android_disableSound
                    onPress={() => {
                      togglePlay();
                    }}
                    hitSlop={14}
                    style={({ pressed }) => [
                      {
                        width: miniControlSize,
                        height: miniControlSize,
                        borderRadius: miniControlRadius,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: miniButtonPrimaryBg,
                        borderWidth: 1,
                        borderColor: miniButtonPrimaryBorder,
                      },
                      pressed && styles.miniButtonPressed,
                    ]}
                  >
                    <Ionicons
                      name={playbackState.isPlaying ? "pause" : "play"}
                      size={25}
                      color={playIconColor}
                      style={!playbackState.isPlaying ? { marginLeft: 1 } : undefined}
                    />
                  </Pressable>
                </View>
              </Pressable>

              <MiniPlayerProgressBar fillColor={playerProgressFillColor} />

              <Animated.View
                pointerEvents={isDragging ? "auto" : "none"}
                style={[
                  styles.mixTrashDock,
                  overTrash && styles.mixTrashDockActive,
                  {
                    opacity: trashOpacity,
                    transform: [
                      { translateX: trashShiftX },
                      { translateY: trashShiftY },
                      { scale: trashScale },
                    ],
                  },
                ]}
              >
                <Ionicons
                  name={overTrash ? "trash" : "trash-outline"}
                  size={17}
                  color={overTrash ? "#ff6b6b" : "rgba(255,255,255,0.84)"}
                />
              </Animated.View>
            </View>
          ) : null}

          <View
            style={[
              styles.navContent,
              isIOS && styles.navContentIOS,
              {
                backgroundColor: navBaseBg,
                paddingHorizontal: navHorizontalPadding,
                paddingTop: 4,
                paddingBottom: Math.min(resolvedBottomInset, 10),
                borderTopWidth: hasActiveMiniPlayer ? StyleSheet.hairlineWidth : 0,
                borderTopColor: "rgba(255, 255, 255, 0.08)",
              },
              !hasActiveMiniPlayer && styles.navContentNavOnly,
            ]}
          >

            {NAV_ITEMS.map((item) => {
              const isFocused = item.route === activeTab;

              return (
                <MemoizedNavTabItem
                  key={item.route}
                  item={item}
                  isFocused={isFocused}
                  isAndroid={isAndroid}
                  isIOS={isIOS}
                  navIconSize={navIconSize}
                  navLabelSize={navLabelSize}
                  navLabelLineHeight={navLabelLineHeight}
                  navItemPaddingTop={navItemPaddingTop}
                  navItemPaddingBottom={navItemPaddingBottom}
                  activeNavColor={activeNavColor}
                  navInactiveColor={navInactiveColor}
                  onPress={handleTabPress}
                  onLongPress={noopLongPress}
                />
              );
            })}
          </View>
        </View>
      </View>

    </>
  );
}

function IOSNativeTabLayout() {
  const { Icon, Label, NativeTabs } = getNativeTabsModule();

  return (
    <NativeTabs
      disableTransparentOnScrollEdge
      minimizeBehavior="never"
      tintColor={Colors.primary}
      iconColor={{ default: "rgba(235,235,245,0.6)", selected: Colors.primary }}
      labelStyle={{
        default: {
          color: "rgba(235,235,245,0.6)",
          fontSize: 10,
          fontWeight: "500",
        },
        selected: {
          color: Colors.primary,
          fontSize: 10,
          fontWeight: "600",
        },
      }}
    >
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search" role="search" />

      <NativeTabs.Trigger name="library">
        <Icon sf={{ default: "square.stack", selected: "square.stack.fill" }} />
        <Label>Library</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="liked-songs">
        <Icon sf={{ default: "heart", selected: "heart.fill" }} />
        <Label>Liked</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="import-songs">
        <Icon sf={{ default: "square.and.arrow.down", selected: "square.and.arrow.down.fill" }} />
        <Label>Import</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function IOSMiniPlayerOverlay() {
  return useIOSMiniPlayerOverlayView();
}

function useIOSMiniPlayerOverlayView() {
  const insets = useSafeAreaInsets();
  const [playerModalVisible, setPlayerModalVisible] = useState(() => globalPlayerDetailsVisibleRef.current);
  useEffect(() => {
    return globalPlayerDetailsVisibleRef.subscribe((visible) => {
      setPlayerModalVisible(visible);
    });
  }, []);
  const coverOpacityRef = useRef<Animated.Value | null>(null);
  if (coverOpacityRef.current === null) coverOpacityRef.current = new Animated.Value(1);
  const coverOpacity = coverOpacityRef.current;

  useEffect(() => {
    Animated.timing(coverOpacity, {
      toValue: playerModalVisible ? 0 : 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [playerModalVisible, coverOpacity]);
  
  // Disable pointer events on artwork during player modal transitions
  const iosArtworkPointerEvents = playerModalVisible ? "none" : "auto";

  const { push: overlayRouterPush } = useRouter();
  const { currentSong, queue, queueIndex } = usePlaybackNowPlaying();
  const playbackState = usePlaybackPlayState();
  const {
    togglePlay,
    textColor,
    setAlbumColor,
    setTextColor,
  } = usePlayerActions();
  const activeSong = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;
  const [coverFailed, setCoverFailed] = useState(false);
  const openPlayerLockRef = useRef(0);

  const openPlayer = useCallback(() => {
    const now = Date.now();
    if (now - openPlayerLockRef.current < 240) return;

    openPlayerLockRef.current = now;
    overlayRouterPush("/player");
  }, [overlayRouterPush]);

  useEffect(() => {
    const urls = mapFilter([
      queue[queueIndex - 1]?.coverUrl,
      activeSong?.coverUrl,
      queue[queueIndex + 1]?.coverUrl,
    ], (url) => url?.trim(), (url): url is string => Boolean(url));

    if (urls.length === 0) return;
    
    // Defer prefetching to avoid blocking navigation transitions
    const timer = setTimeout(() => {
      void Image.prefetch(urls, "memory-disk").catch(() => { });
      preloadDominantColors(urls);
    }, 350);
    
    return () => clearTimeout(timer);
  }, [activeSong?.coverUrl, queue, queueIndex]);

  const lastMix = useLastMix();
  const mixBarOneRef = useRef<Animated.Value | null>(null);
  if (mixBarOneRef.current === null) mixBarOneRef.current = new Animated.Value(0.32);
  const mixBarOne = mixBarOneRef.current;
  const mixBarTwoRef = useRef<Animated.Value | null>(null);
  if (mixBarTwoRef.current === null) mixBarTwoRef.current = new Animated.Value(0.58);
  const mixBarTwo = mixBarTwoRef.current;
  const mixBarThreeRef = useRef<Animated.Value | null>(null);
  if (mixBarThreeRef.current === null) mixBarThreeRef.current = new Animated.Value(0.44);
  const mixBarThree = mixBarThreeRef.current;
  const mixImage = useMemo(() => {
    const first = compactMap((lastMix?.images ?? "")
      .split(","), (value) => value.trim())[0];
    return first ?? "";
  }, [lastMix?.images]);
  const mixImages = useMemo(() => {
    const all = compactMap((lastMix?.images ?? "")
      .split(","), (value) => value.trim());
    return all;
  }, [lastMix?.images]);
  const mixSongIds = useMemo(() => {
    const raw = lastMix?.songIds ?? "";
    if (!raw) return [] as string[];
    return compactMap(raw.split(","), (id) => id.trim());
  }, [lastMix?.songIds]);
  const activeSongId = activeSong?.id ?? "";
  const isPlayingFromLastMix = useMemo(() => {
    if (!playbackState.isPlaying || !activeSongId || mixSongIds.length === 0) return false;
    if (!mixSongIds.includes(activeSongId)) return false;
    if (queue.length !== mixSongIds.length) return false;
    const mixSet = new Set(mixSongIds);
    return queue.every((song) => mixSet.has(song.id));
  }, [activeSongId, playbackState.isPlaying, mixSongIds, queue]);
  const applyMiniPlayerColors = useCallback((primary: string, text: string) => {
    setAlbumColor(primary);
    setTextColor(text);
  }, [setAlbumColor, setTextColor]);

  useEffect(() => {
    if (!activeSong?.coverUrl) {
      applyMiniPlayerColors("#25282E", "#F5FBFF");
      return () => { };
    }
    let active = true;
    const immediateColors = getImmediateArtworkColor(activeSong.coverUrl);
    applyMiniPlayerColors(immediateColors.primary, immediateColors.text);

    // Defer to next frame to avoid blocking navigation
    requestAnimationFrame(() => {
      extractDominantColor(activeSong.coverUrl)
        .then((colors) => {
          if (!active) return;
          applyMiniPlayerColors(colors.primary, colors.text);
        })
        .catch(() => { });
    });

    return () => {
      active = false;
    };
  }, [activeSong?.id, activeSong?.coverUrl, applyMiniPlayerColors]);

  useEffect(() => {
    setCoverFailed(false);
  }, [activeSong?.id, activeSong?.coverUrl]);

  useEffect(() => {
    const resetBars = () => {
      Animated.parallel([
        Animated.timing(mixBarOne, { toValue: 0.32, duration: 180, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarTwo, { toValue: 0.58, duration: 180, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarThree, { toValue: 0.44, duration: 180, useNativeDriver: true, isInteraction: false }),
      ]).start();
    };

    if (!lastMix || !isPlayingFromLastMix) {
      resetBars();
      return;
    }

    const loopOne = Animated.loop(
      Animated.sequence([
        Animated.timing(mixBarOne, { toValue: 0.96, duration: 230, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarOne, { toValue: 0.24, duration: 280, useNativeDriver: true, isInteraction: false }),
      ])
    );
    const loopTwo = Animated.loop(
      Animated.sequence([
        Animated.timing(mixBarTwo, { toValue: 0.84, duration: 180, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarTwo, { toValue: 0.3, duration: 240, useNativeDriver: true, isInteraction: false }),
      ])
    );
    const loopThree = Animated.loop(
      Animated.sequence([
        Animated.timing(mixBarThree, { toValue: 0.9, duration: 260, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarThree, { toValue: 0.22, duration: 210, useNativeDriver: true, isInteraction: false }),
      ])
    );

    loopOne.start();
    loopTwo.start();
    loopThree.start();

    return () => {
      loopOne.stop();
      loopTwo.stop();
      loopThree.stop();
    };
  }, [isPlayingFromLastMix, lastMix, mixBarOne, mixBarThree, mixBarTwo]);

  if (!activeSong) {
    return null;
  }

  const resolvedTextColor = (() => {
    const raw = textColor || "#F5F5F7";
    const hex = raw.replace("#", "");
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness < 100) return "#F5F5F7";
    }
    return raw;
  })();
  const secondaryColor = colorToRgba(resolvedTextColor, 0.7, "rgba(235,235,245,0.7)");
  const progressFillColor = Colors.primary;
  const tabBarVisualHeight = 49;
  const tabBarGap = 6;
  const bottomOffset = Math.max(insets.bottom + tabBarVisualHeight + tabBarGap, 80);

  return (
    <View pointerEvents="box-none" style={[styles.iosMiniPlayerRoot, { bottom: bottomOffset }]}>
      <View style={styles.iosMiniPlayerShell}>
        <View pointerEvents="none" style={styles.iosMiniPlayerTopHairline} />

        <View style={styles.iosMiniPlayerRow}>
          <Pressable style={styles.iosMiniPlayerMain} onPress={openPlayer} android_disableSound>
            <Animated.View 
              pointerEvents={iosArtworkPointerEvents}
              style={[styles.iosMiniPlayerArtworkShell, { opacity: coverOpacity }]}
            >
              {activeSong.coverUrl && !coverFailed ? (
                <Image
                  source={{ uri: activeSong.coverUrl }}
                  style={styles.iosMiniPlayerCover}
                  contentFit="cover"
                  transition={0}
                  onError={() => setCoverFailed(true)}
                />
              ) : (
                <View
                  style={[
                    styles.iosMiniPlayerCover,
                    styles.iosMiniPlayerCoverFallback,
                  ]}
                >
                  <Ionicons name="musical-notes" size={20} color="rgba(255,255,255,0.72)" />
                </View>
              )}
            </Animated.View>

            <View style={styles.iosMiniPlayerText}>
              <PingPongScroll
                text={activeSong.title}
                style={[styles.iosMiniPlayerTitle, { color: resolvedTextColor }]}
                velocity={14}
              />
              <PingPongScroll
                text={activeSong.artist}
                style={[styles.iosMiniPlayerArtist, { color: secondaryColor }]}
                velocity={11}
              />
            </View>
          </Pressable>

          {lastMix ? (
            <Pressable
              android_disableSound
              onPress={() => {
                overlayRouterPush({ pathname: "/artist-mix", params: lastMix });
              }}
              hitSlop={8}
              style={styles.iosMiniPlayerInlineMixBtn}
            >
              <View style={styles.iosMiniPlayerMixCard}>
                {/* Show multiple artist images in a grid for multi-artist mixes */}
                {mixImages.length > 1 ? (
                  <View style={styles.iosMiniPlayerMixGrid}>
                    {mixImages.slice(0, 4).map((img, idx) => (
                      <View key={img || `mix-slot-${idx + 1}`} style={styles.iosMiniPlayerMixGridCell}>
                        {img ? (
                          <Image
                            source={{ uri: img }}
                            style={styles.iosMiniPlayerMixGridImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                        ) : (
                          <View style={[styles.iosMiniPlayerMixGridImage, styles.iosMiniPlayerMixGridFallback]}>
                            <Ionicons name="person" size={8} color="rgba(255,255,255,0.88)" />
                          </View>
                        )}
                      </View>
                    ))}
                    {mixImages.length > 4 && (
                      <View style={[styles.iosMiniPlayerMixGridCell, styles.iosMiniPlayerMixGridMore]}>
                        <Text style={styles.iosMiniPlayerMixGridMoreText}>+{mixImages.length - 4}</Text>
                      </View>
                    )}
                  </View>
                ) : mixImage ? (
                  <Image
                    source={{ uri: mixImage }}
                    style={[styles.iosMiniPlayerMixFullImage, styles.iosMiniPlayerMixFullImageMuted]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View
                    style={[
                      styles.iosMiniPlayerMixFullImage,
                      styles.iosMiniPlayerMixHeroFallback,
                      styles.iosMiniPlayerMixFullImageMuted,
                    ]}
                  >
                    <Ionicons name="person" size={14} color="rgba(255,255,255,0.88)" />
                  </View>
                )}
                <View style={styles.iosMiniPlayerMixEqOverlay}>
                  <Animated.View
                    style={[
                      styles.iosMiniPlayerMixEqBar,
                      { opacity: isPlayingFromLastMix ? 0.95 : 0.42, transform: [{ scaleY: mixBarOne }] },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.iosMiniPlayerMixEqBar,
                      { opacity: isPlayingFromLastMix ? 0.95 : 0.42, transform: [{ scaleY: mixBarTwo }] },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.iosMiniPlayerMixEqBar,
                      { opacity: isPlayingFromLastMix ? 0.95 : 0.42, transform: [{ scaleY: mixBarThree }] },
                    ]}
                  />
                </View>
              </View>
            </Pressable>
          ) : null}

          <View style={styles.iosMiniPlayerControls}>
            <Pressable
              android_disableSound
              onPress={() => {
                togglePlay();
              }}
              hitSlop={14}
              style={({ pressed }) => [
                {
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(28, 31, 38, 0.95)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                },
                pressed && styles.miniButtonPressed,
              ]}
            >
              <Ionicons
                name={playbackState.isPlaying ? "pause" : "play"}
                size={25}
                color="#FFFFFF"
                style={!playbackState.isPlaying ? { marginLeft: 2 } : undefined}
              />
            </Pressable>
            <Pressable
              android_disableSound
              onPress={() => globalQueueSheetRef.current?.expand()}
              hitSlop={14}
              style={({ pressed }) => [
                {
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(28, 31, 38, 0.95)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                },
                pressed && styles.miniButtonPressed,
              ]}
            >
              <Ionicons name="list" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        <IOSMiniPlayerProgressBar fillColor={progressFillColor} />
      </View>
    </View>
  );
}

function AuthRouteFallback() {
  return <View style={styles.authRouteFallback} />;
}

export default function TabLayout() {
  const pathname = usePathname();
  const { loading, isAuthenticated, isGuest } = useAuth();

  const shouldHideTabBar = pathname === "/import-songs-file" || pathname?.startsWith("/import-songs-file");

  if (loading) {
    return <AuthRouteFallback />;
  }

  if (!isAuthenticated && !isGuest) {
    return <Redirect href="/login" />;
  }

  // NativeTabs only work correctly when distributed via App Store or TestFlight.
  // Sideloaded / unsigned IPAs run with __DEV__ = false but lack the required
  // entitlements, causing an immediate crash. Disable NativeTabs entirely until
  // the app is properly signed and distributed through Apple channels.
  const isProductionBuild = false; // TODO: re-enable when distributing via App Store

  if (isProductionBuild) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <IOSNativeTabLayout />
        {!shouldHideTabBar ? <IOSMiniPlayerOverlay /> : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Tabs
        detachInactiveScreens
        screenOptions={{
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
          animation: "shift",
          transitionSpec: TAB_TRANSITION_SPEC,
          sceneStyle: { backgroundColor: Colors.background },
        }}
        tabBar={() => null}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="search" options={{ title: "Search" }} />
        <Tabs.Screen name="library" options={{ title: "Library" }} />
        <Tabs.Screen name="liked-songs" options={{ title: "Liked" }} />
        <Tabs.Screen name="import-songs" options={{ title: "Import" }} />
      </Tabs>
      <AppNavBar hidden={shouldHideTabBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  authRouteFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  iosMiniPlayerRoot: {
    position: "absolute",
    left: 19,
    right: 19,
    zIndex: 30,
  },
  iosMiniPlayerDockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iosMiniPlayerShell: {
    flex: 1,
    height: 50,
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#111317",
    boxShadow: "none",
  },
  iosMiniPlayerBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  iosMiniPlayerTopHairline: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  iosMiniPlayerRow: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 6,
    paddingVertical: 0,
  },
  iosMiniPlayerMain: {
    flex: 1,
    height: "100%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  iosMiniPlayerArtworkShell: {
    width: 50,
    height: "100%",
    padding: 5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  iosMiniPlayerCover: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  iosMiniPlayerCoverFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  iosMiniPlayerText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 9,
    marginRight: 6,
    justifyContent: "center",
  },
  iosMiniPlayerTitle: {
    fontSize: 13.5,
    lineHeight: 17,
    fontFamily: "Inter_700Bold",
  },
  iosMiniPlayerArtist: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_500Medium",
  },
  iosMiniPlayerMixSimpleContent: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  iosMiniPlayerMixCard: {
    width: "100%",
    height: "100%",
    borderRadius: 28,
    overflow: "hidden",
  },
  iosMiniPlayerMixFullImage: {
    width: "100%",
    height: "100%",
  },
  iosMiniPlayerMixFullImageMuted: {
    opacity: 0.74,
  },
  iosMiniPlayerMixHeroFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  iosMiniPlayerMixEqOverlay: {
    position: "absolute",
    right: 5,
    bottom: 5,
    height: 15,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    borderRadius: 9,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: "rgba(8,8,10,0.42)",
  },
  iosMiniPlayerMixEqBar: {
    width: 2.4,
    height: 10,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    transform: [{ scaleY: 0.4 }],
  },
  iosMiniPlayerMixGrid: {
    width: "100%",
    height: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#1a1a1a",
  },
  iosMiniPlayerMixGridCell: {
    width: "50%",
    height: "50%",
    overflow: "hidden",
    backgroundColor: "#0a0a0a",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  iosMiniPlayerMixGridImage: {
    width: "100%",
    height: "100%",
    opacity: 0.8,
  },
  iosMiniPlayerMixGridFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  iosMiniPlayerMixGridMore: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  iosMiniPlayerMixGridMoreText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  iosMiniPlayerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 0,
    flexShrink: 0,
  },
  iosMiniPlayerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  iosMiniPlayerPrimaryButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  iosMiniPlayerSecondaryButton: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  miniButtonPressed: {
    opacity: 0.9,
  },
  iosMiniPlayerInlineMixBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: "hidden",
    marginRight: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "transparent",
  },
  iosMiniPlayerSideActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    marginLeft: 0,
  },
  iosMiniPlayerSideActionBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
    backgroundColor: "transparent",
  },
  iosMiniPlayerSideActionBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  iosMiniPlayerProgressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1.5,
    borderRadius: 0,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  iosMiniPlayerProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 40,
    alignItems: "center",
  },
  wrapperHidden: {
    opacity: 0,
    display: "none",
  },
  container: {
    width: "100%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  containerIOS: {},
  containerNavOnly: {},
  containerNavOnlyIOS: {},
  glassLayer: {
    ...StyleSheet.absoluteFillObject,
  },

  playerSection: {
    backgroundColor: "#0A0A0C",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(61, 74, 61, 0.4)",
    overflow: "hidden",
  },
  playerSectionIOS: {
    borderBottomColor: "rgba(255,255,255,0.07)",
  },

  playerTopEdge: {
    position: "absolute",
    top: 0,
    left: 8,
    right: 8,
    height: 1,
    backgroundColor: "rgba(38,225,154,0.28)",
    opacity: 0.32,
  },
  playerCornerAccentLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 10,
    height: 7,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopLeftRadius: 10,
    opacity: 0.36,
  },
  playerCornerAccentRight: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 10,
    height: 7,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderTopRightRadius: 10,
    opacity: 0.36,
  },
  playerProgressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    borderRadius: 0,
    overflow: "hidden",
    backgroundColor: "rgba(223, 226, 235, 0.18)",
  },
  playerProgressFill: {
    height: 2,
    backgroundColor: "#FFFFFF",
  },

  // Mix chip — compact black pill, right of song title
  mixChipWrap: {
    flexShrink: 0,
  },
  mixChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    flexShrink: 0,
    marginRight: 6,
    overflow: "hidden",
    paddingHorizontal: 8,
  },
  mixChipDragging: {
    borderColor: "rgba(255,255,255,0.42)",
  },
  mixChipDeleteReady: {
    borderColor: "rgba(255, 92, 92, 0.85)",
    backgroundColor: "rgba(35, 2, 2, 0.94)",
  },
  mixChipAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  mixChipAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#000",
    backgroundColor: "#1a1a1a",
  },
  mixTrashDock: {
    position: "absolute",
    left: 60,
    top: "50%",
    width: 32,
    height: 32,
    marginTop: -16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(15,15,15,0.96)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
  },
  mixTrashDockActive: {
    borderColor: "rgba(255, 92, 92, 0.9)",
    backgroundColor: "rgba(82, 16, 16, 0.95)",
  },
  playerRow: {
    height: 60,
    paddingLeft: 10,
    paddingRight: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  coverWrap: {
    width: 48,
    height: 48,
    overflow: "hidden",
    borderRightWidth: 0,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  coverFallback: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  songInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    marginRight: 8,
    justifyContent: "center",
  },
  songInfoDuringMixDrag: {
    opacity: 0.38,
  },
  songTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    lineHeight: 17,
  },
  songArtist: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    lineHeight: 14,
    marginTop: 1,
  },
  playerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 4,
    flexShrink: 0,
  },
  iconButton: {
    minWidth: 42,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "rgba(38, 42, 49, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(61, 74, 61, 0.38)",
  },
  iconButtonPrimary: {
    backgroundColor: "#26e19a",
    borderColor: "rgba(38, 225, 154, 0.72)",
  },
  navContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    backgroundColor: "transparent",
    overflow: "hidden",
    position: "relative",
    borderTopWidth: 0,
    borderTopColor: "rgba(255, 255, 255, 0.09)",
  },
  navContentIOS: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  navContentNavOnly: {},

  navItemAnimWrap: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  navIconWrap: {
    width: 44,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  navIconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  navItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    zIndex: 1,
  },
  navItemPressed: {
    opacity: 0.9,
  },
  navItemIOS: {
    borderRadius: 18,
    marginHorizontal: 2,
  },
  navItemActive: {
    backgroundColor: "transparent",
  },
  navItemIOSActive: {
    backgroundColor: "transparent",
  },
  navLabel: {
    fontSize: 10,
    lineHeight: 12,
    includeFontPadding: false,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    color: "rgba(255, 255, 255, 0.62)",
    letterSpacing: 0.1,
  },
  navLabelIOS: {
    fontFamily: "Inter_600SemiBold",
    color: "rgba(235,235,245,0.6)",
    letterSpacing: -0.1,
  },
  navLabelActive: {
    color: Colors.text,
  },
});
