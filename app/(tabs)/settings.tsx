import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { safeGoBack } from "@/utils/navigation";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import {
  getSettings,
  saveSettings,
  AppSettings,
  EQUALIZER_PRESETS,
} from "@/lib/storage";

const FREQ_BANDS = ["60Hz", "150Hz", "400Hz", "1KHz", "2.4KHz", "15KHz"];
const PRESET_NAMES = Object.keys(EQUALIZER_PRESETS);
const QUALITY_OPTIONS: Array<{ label: string; value: "low" | "medium" | "high" }> = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const BAR_COLORS = ["#FF6B6B", "#FFA07A", "#FFD700", "#98FB98", "#87CEEB", "#DDA0DD"];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { user, isAuthenticated, isGuest, logout } = useAuth();
  const router = useRouter();
  const { checkForUpdates, isChecking } = useAppUpdate();

  const [settings, setSettings] = useState<AppSettings>({
    streamingQuality: "high",
    downloadQuality: "high",
    equalizer: { "60Hz": 0, "150Hz": 0, "400Hz": 0, "1KHz": 0, "2.4KHz": 0, "15KHz": 0 },
    equalizerEnabled: false,
    crossfade: 0,
    gapless: true,
    normalizeVolume: false,
  });

  const [activePreset, setActivePreset] = useState<string>("Flat");

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      const match = PRESET_NAMES.find((name) => {
        const preset = EQUALIZER_PRESETS[name];
        return FREQ_BANDS.every((band) => preset[band] === (s.equalizer[band] ?? 0));
      });
      if (match) setActivePreset(match);
      else setActivePreset("");
    });
  }, []);

  const updateSettings = useCallback(
    (partial: Partial<AppSettings>) => {
      const updated = { ...settings, ...partial };
      setSettings(updated);
      saveSettings(partial);
    },
    [settings]
  );

  const selectPreset = useCallback(
    (name: string) => {
      const preset = EQUALIZER_PRESETS[name];
      if (!preset) return;
      setActivePreset(name);
      const updated = { ...settings, equalizer: { ...preset } };
      setSettings(updated);
      saveSettings({ equalizer: { ...preset } });
    },
    [settings]
  );

  const cycleBandValue = useCallback(
    (band: string) => {
      const current = settings.equalizer[band] ?? 0;
      let next = current + 3;
      if (next > 12) next = -12;
      const newEq = { ...settings.equalizer, [band]: next };
      setSettings((prev) => ({ ...prev, equalizer: newEq }));
      saveSettings({ equalizer: newEq });

      const match = PRESET_NAMES.find((name) => {
        const preset = EQUALIZER_PRESETS[name];
        return FREQ_BANDS.every((b) => preset[b] === newEq[b]);
      });
      setActivePreset(match || "");
    },
    [settings]
  );

  const clearCache = () => {
    Alert.alert("Clear Cache", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          Alert.alert("Done", "Cache cleared");
        },
      },
    ]);
  };

  const getBarHeight = (db: number) => {
    const normalized = (db + 12) / 24;
    return Math.max(4, normalized * 120);
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={safeGoBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileSection}>
          {user?.picture ? (
            <Image
              source={{ uri: user.picture }}
              style={styles.profileImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color={Colors.subtext} />
            </View>
          )}
          <Text style={styles.profileName}>
            {user ? user.name || "Mavrixfy User" : isGuest ? "Guest User" : "Mavrixfy User"}
          </Text>
          <Text style={styles.profileSub}>
            {user ? user.email : isGuest ? "Sign in to sync your data" : "Free Plan"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Playback</Text>

          <Text style={styles.settingLabel}>Streaming Quality</Text>
          <View style={styles.segmentRow}>
            {QUALITY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.segmentBtn,
                  settings.streamingQuality === opt.value && styles.segmentBtnActive,
                ]}
                onPress={() => updateSettings({ streamingQuality: opt.value })}
              >
                <Text
                  style={[
                    styles.segmentText,
                    settings.streamingQuality === opt.value && styles.segmentTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Crossfade</Text>
              <Text style={styles.settingValue}>{settings.crossfade}s</Text>
            </View>
            <View style={styles.sliderContainer}>
              {Array.from({ length: 13 }, (_, i) => (
                <Pressable
                  key={i}
                  style={[
                    styles.sliderDot,
                    i <= settings.crossfade && styles.sliderDotActive,
                  ]}
                  onPress={() => updateSettings({ crossfade: i })}
                />
              ))}
            </View>
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.settingLabel}>Gapless Playback</Text>
            <Switch
              value={settings.gapless}
              onValueChange={(val) => updateSettings({ gapless: val })}
              trackColor={{ false: Colors.inactive, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.settingLabel}>Normalize Volume</Text>
            <Switch
              value={settings.normalizeVolume}
              onValueChange={(val) => updateSettings({ normalizeVolume: val })}
              trackColor={{ false: Colors.inactive, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>

          <View style={styles.aboutRow}>
            <Text style={styles.settingLabel}>Version</Text>
            <Text style={styles.settingValue}>
              {Constants.expoConfig?.version || "1.2.0"}
            </Text>
          </View>
          
          <View style={styles.aboutRow}>
            <Text style={styles.settingLabel}>Build</Text>
            <Text style={styles.settingValue}>
              {Platform.OS === "android" 
                ? Constants.expoConfig?.android?.versionCode || "2"
                : Constants.expoConfig?.ios?.buildNumber || "2"}
            </Text>
          </View>

          <Pressable 
            style={styles.updateBtn} 
            onPress={() => checkForUpdates(true)}
            disabled={isChecking}
          >
            {isChecking ? (
              <ActivityIndicator size="small" color="#1DB954" />
            ) : (
              <Ionicons name="refresh-outline" size={18} color="#1DB954" />
            )}
            <Text style={styles.updateText}>
              {isChecking ? "Checking..." : "Check for Updates"}
            </Text>
          </Pressable>

          <Pressable style={styles.dangerBtn} onPress={clearCache}>
            <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
            <Text style={styles.dangerText}>Clear Cache</Text>
          </Pressable>

          {isAuthenticated ? (
            <Pressable
              style={styles.signOutBtn}
              onPress={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              <Ionicons name="log-out-outline" size={20} color="#FF6B6B" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.signInBtn}
              onPress={() => router.replace("/login")}
            >
              <Ionicons name="log-in-outline" size={20} color="#1DB954" />
              <Text style={styles.signInText}>Sign In</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  scrollView: {
    flex: 1,
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  profileName: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  profileSub: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 16,
  },
  settingLabel: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  settingValue: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  settingRow: {
    marginTop: 16,
  },
  settingInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  segmentRow: {
    flexDirection: "row",
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  segmentTextActive: {
    color: Colors.black,
    fontFamily: "Inter_700Bold",
  },
  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sliderDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  sliderDotActive: {
    backgroundColor: Colors.primary,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  presetsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  presetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
  },
  presetBtnActive: {
    backgroundColor: Colors.primary,
  },
  presetText: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  presetTextActive: {
    color: Colors.black,
    fontFamily: "Inter_700Bold",
  },
  eqContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    height: 200,
  },
  eqBand: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  eqDbLabel: {
    color: Colors.text,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
  eqBarTrack: {
    flex: 1,
    width: 28,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "flex-end",
    alignItems: "center",
    overflow: "hidden",
  },
  eqBar: {
    width: "100%",
    borderRadius: 4,
  },
  eqFreqLabel: {
    color: Colors.subtext,
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
  },
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  updateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "rgba(29,185,84,0.15)",
    marginTop: 8,
    marginBottom: 8,
  },
  updateText: {
    color: "#1DB954",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
  },
  dangerText: {
    color: "#FF6B6B",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  profileImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 12,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,75,75,0.15)",
    marginTop: 8,
  },
  signOutText: {
    color: "#FF6B6B",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(29,185,84,0.15)",
    marginTop: 8,
  },
  signInText: {
    color: "#1DB954",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
