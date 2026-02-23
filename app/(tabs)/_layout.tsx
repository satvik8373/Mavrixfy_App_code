import { Tabs } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo } from "react";
import Colors from "@/constants/colors";
import MiniPlayer from "@/components/MiniPlayer";

const TAB_BAR_HEIGHT_BASE = 60;
const WEB_TAB_HEIGHT = 84;

// Memoized icon components for better performance
const TabIcon = memo<{ name: string; color: string; focused: boolean }>(
  ({ name, color, focused }) => (
    <View style={focused && styles.activeIconContainer}>
      <Ionicons name={name as any} size={24} color={color} />
    </View>
  )
);

TabIcon.displayName = 'TabIcon';

export default function TabLayout() {
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();

  // Ensure tab bar extends to bottom edge
  const tabBarActualHeight = isWeb
    ? WEB_TAB_HEIGHT
    : TAB_BAR_HEIGHT_BASE + Math.max(insets.bottom, 0);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: "#FFFFFF",
          tabBarInactiveTintColor: "rgba(255, 255, 255, 0.5)",
          tabBarLabelStyle: {
            fontSize: 10,
            fontFamily: "Inter_600SemiBold",
            marginTop: 2,
            marginBottom: 2,
          },
          tabBarIconStyle: {
            marginTop: 6,
            marginBottom: 0,
          },
          tabBarStyle: {
            position: "absolute",
            backgroundColor: "transparent",
            borderTopWidth: 0,
            elevation: 0,
            height: tabBarActualHeight,
            paddingBottom: isWeb ? 8 : Math.max(insets.bottom, 0),
            paddingTop: 8,
          },
          tabBarBackground: () => (
            <View style={StyleSheet.absoluteFill}>
              <LinearGradient
                colors={[
                  "rgba(10, 10, 10, 0)",
                  "rgba(10, 10, 10, 0.6)",
                  "rgba(10, 10, 10, 0.88)",
                  "rgba(10, 10, 10, 0.96)",
                  "#0a0a0a",
                  "#0a0a0a",
                ]}
                locations={[0, 0.15, 0.35, 0.5, 0.65, 1]}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  top: -40,
                  paddingBottom: Math.max(insets.bottom, 0),
                }}
              />
            </View>
          ),
          tabBarItemStyle: {
            paddingVertical: 0,
          },
          animation: "shift",
          lazy: true,
          freezeOnBlur: true,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon 
                name={focused ? "home-sharp" : "home-outline"} 
                color={color} 
                focused={focused} 
              />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon 
                name={focused ? "search-sharp" : "search-outline"} 
                color={color} 
                focused={focused} 
              />
            ),
          }}
        />
        <Tabs.Screen
          name="liked-songs"
          options={{
            title: "Liked Songs",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon 
                name={focused ? "heart-sharp" : "heart-outline"} 
                color={focused ? "#1DB954" : color} 
                focused={focused} 
              />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: "Your Library",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon 
                name={focused ? "library-sharp" : "library-outline"} 
                color={color} 
                focused={focused} 
              />
            ),
          }}
        />
        <Tabs.Screen
          name="playlist/[id]"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="queue"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            href: null, // Hide from tab bar
          }}
        />
      </Tabs>
      <MiniPlayer bottomOffset={tabBarActualHeight} />
    </View>
  );
}

const styles = StyleSheet.create({
  activeIconContainer: {
    // Optional: add subtle glow or background for active state
  },
});
