import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect, useState } from "react";
import { Platform, View, Text } from "react-native";
import { fetch } from "expo/fetch";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdateModal } from "@/components/UpdateModal";
import { queryClient, getApiUrl } from "@/lib/query-client";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import Colors from "@/constants/colors";
import { logAppOpen } from "@/lib/analytics";
import { useAndroidAuto } from "@/hooks/useAndroidAuto";

SplashScreen.preventAutoHideAsync();

// Set navigation bar color on Android - make it black
if (Platform.OS === 'android') {
  SystemUI.setBackgroundColorAsync('#000000');
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { loading, isAuthenticated, isGuest } = useAuth();
  const { syncMusicData, syncPlaylistSongs } = useAndroidAuto();
  
  // App update checking
  const { updateInfo, showModal, handleUpdate, handleClose } = useAppUpdate();

  // Android Auto integration - sync real music data from JioSaavn + Firestore
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const syncAndroidAutoData = async () => {
      try {
        const apiUrl = getApiUrl();

        // ── 1. Fetch trending songs from JioSaavn ──────────────────────────
        const songsRes = await fetch(
          `${apiUrl}api/jiosaavn/search/songs?query=trending&limit=25`,
          { headers: { Accept: 'application/json' } }
        );
        let trendingSongs: any[] = [];
        if (songsRes.ok) {
          const json = await songsRes.json();
          const raw: any[] = json?.data?.results || json?.results || [];
          trendingSongs = raw
            .filter((s: any) => s?.downloadUrl?.length > 0)
            .map((s: any) => {
              const images: any[] = s.image || [];
              const artwork =
                images.find((i: any) => i.quality === '500x500')?.url ||
                images[images.length - 1]?.url || '';
              const dlUrls: any[] = s.downloadUrl || [];
              const audioUrl =
                dlUrls.find((u: any) => u.quality === '320kbps')?.url ||
                dlUrls[dlUrls.length - 1]?.url || '';
              const artistNames =
                s.artists?.primary?.map((a: any) => a.name).join(', ') ||
                s.subtitle || 'Unknown Artist';
              return {
                id: s.id || '',
                title: s.name || s.title || '',
                artist: artistNames,
                album: s.album?.name || '',
                audioUrl,
                coverUrl: artwork,
                duration: s.duration || 0,
              };
            })
            .filter((s: any) => s.id && s.audioUrl);
        }

        // ── 2. Fetch JioSaavn featured playlists ───────────────────────────
        const playlistRes = await fetch(
          `${apiUrl}api/jiosaavn/search/playlists?query=top+50&limit=20`,
          { headers: { Accept: 'application/json' } }
        );
        let jiosaavnPlaylists: any[] = [];
        if (playlistRes.ok) {
          const json = await playlistRes.json();
          const raw: any[] = json?.data?.results || json?.results || [];
          jiosaavnPlaylists = raw
            .filter((p: any) => p?.songCount > 0)
            .slice(0, 12)
            .map((p: any) => ({
              id: p.id || '',
              title: p.name || p.title || '',
              subtitle: `${p.songCount || 0} songs`,
            }))
            .filter((p: any) => p.id);
        }

        // ── 3. Fetch Firestore public playlists ────────────────────────────
        let firestorePlaylists: any[] = [];
        try {
          const { getPublicPlaylists, firestorePlaylistToLocalSongs } = await import('@/lib/firestore');
          const publicPlaylists = await getPublicPlaylists();
          firestorePlaylists = publicPlaylists
            .filter((fp: any) => fp.songs && fp.songs.length > 0)
            .map((fp: any) => ({
              id: `firestore_${fp.id}`,           // prefix keeps IDs unique
              title: fp.name || 'My Playlist',
              subtitle: `${fp.songs.length} songs · ${fp.createdBy?.name || 'Mavrixfy'}`,
              _songs: firestorePlaylistToLocalSongs(fp), // carry songs for registration
            }));

          // Pre-register each Firestore playlist's songs so they are browseable
          // and playable in the car before the user even taps a playlist
          firestorePlaylists.forEach((fp: any) => {
            if (fp._songs?.length > 0) {
              syncPlaylistSongs(fp.id, fp._songs);
            }
          });
        } catch (fsError) {
          console.warn('[AndroidAuto] Could not load Firestore playlists:', fsError);
        }

        // Merge playlists: Firestore first (personal), then JioSaavn
        const allPlaylists = [
          ...firestorePlaylists.map(({ _songs, ...rest }: any) => rest), // strip _songs
          ...jiosaavnPlaylists,
        ];

        if (trendingSongs.length > 0 || allPlaylists.length > 0) {
          await syncMusicData({ trending: trendingSongs, playlists: allPlaylists });
          console.log(
            `✅ Android Auto synced: ${trendingSongs.length} songs, ` +
            `${firestorePlaylists.length} Firestore + ${jiosaavnPlaylists.length} JioSaavn playlists`
          );
        } else {
          console.warn('⚠️ Android Auto: no data returned, skipping sync');
        }
      } catch (error) {
        console.error('Failed to sync Android Auto data:', error);
      }
    };

    // Small delay so the app finishes mounting before network requests start
    const timer = setTimeout(syncAndroidAutoData, 2000);
    return () => clearTimeout(timer);
  }, [syncMusicData, syncPlaylistSongs]);

  useEffect(() => {
    if (loading) return;

    const isLoginScreen = segments[0] === "login";
    const isAuthenticated_or_Guest = isAuthenticated || isGuest;

    if (!isAuthenticated_or_Guest && !isLoginScreen) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, isGuest, segments, router]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          gestureEnabled: true,
          animation: "default",
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="player"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            animationDuration: 250,
            gestureDirection: "vertical",
          }}
        />
        <Stack.Screen
          name="login"
          options={{
            gestureEnabled: false,
          }}
        />
      </Stack>
      
      {/* Update Modal */}
      <UpdateModal
        visible={showModal}
        versionInfo={updateInfo}
        onClose={handleClose}
        onUpdate={handleUpdate}
      />
    </>
  );
}

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    async function prepare() {
      try {
        await logAppOpen();
      } catch (e) {
        // Silent fail
      } finally {
        setAppIsReady(true);
      }
    }

    if (fontsLoaded) {
      prepare();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (appIsReady && fontsLoaded) {
      // Hide splash screen after everything is ready
      SplashScreen.hideAsync().catch(() => { });
    }
  }, [appIsReady, fontsLoaded]);

  // Show error screen if something went wrong
  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', padding: 20 }}>
        <Text style={{ color: '#ff0000', fontSize: 20, marginBottom: 10 }}>Error Loading App</Text>
        <Text style={{ color: '#fff', fontSize: 14 }}>{error.message}</Text>
      </View>
    );
  }

  if (!appIsReady || !fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary onError={(error, stackTrace) => {
      console.error('ErrorBoundary caught:', error);
      console.error('Stack:', stackTrace);
      setError(error);
    }}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AuthProvider>
            <PlayerProvider>
              <StatusBar style="light" />
              <RootLayoutNav />
            </PlayerProvider>
          </AuthProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
