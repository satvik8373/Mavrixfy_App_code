import { Tabs } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import Colors from "@/constants/colors";
import MiniPlayer from "@/components/MiniPlayer";

const TAB_BAR_HEIGHT_BASE = 50;
const WEB_TAB_HEIGHT = 84;

export default function TabLayout() {
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();

  const tabBarActualHeight = isWeb
    ? WEB_TAB_HEIGHT
    : TAB_BAR_HEIGHT_BASE + insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: "#FFFFFF",
          tabBarInactiveTintColor: "rgba(255, 255, 255, 0.7)",
          tabBarLabelStyle: {
            fontSize: 10,
            fontFamily: "Inter_500Medium",
            marginTop: 0,
            marginBottom: 0,
          },
          tabBarIconStyle: {
            marginTop: 0,
            marginBottom: 0,
          },
          tabBarStyle: {
            position: "absolute",
            backgroundColor: "transparent",
            borderTopWidth: 0,
            elevation: 0,
            height: tabBarActualHeight,
            paddingBottom: isWeb ? 0 : insets.bottom,
            paddingTop: 0,
          },
          tabBarBackground: () => (
            <LinearGradient
              colors={[
                "transparent",
                "rgba(0, 0, 0, 0.02)",
                "rgba(0, 0, 0, 0.05)",
                "rgba(0, 0, 0, 0.1)",
                "rgba(0, 0, 0, 0.18)",
                "rgba(0, 0, 0, 0.28)",
                "rgba(0, 0, 0, 0.4)",
                "rgba(0, 0, 0, 0.55)",
                "rgba(0, 0, 0, 0.7)",
                "rgba(0, 0, 0, 0.82)",
                "rgba(0, 0, 0, 0.91)",
                "rgba(0, 0, 0, 0.96)",
                "#000000",
              ]}
              locations={[0, 0.03, 0.07, 0.12, 0.18, 0.26, 0.35, 0.45, 0.56, 0.68, 0.8, 0.9, 1]}
              style={StyleSheet.absoluteFill}
            />
          ),
          tabBarItemStyle: {
            paddingVertical: 0,
          },
          // Remove iOS-style animations
          animation: "none",
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "search" : "search-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: "Your Library",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "albums" : "albums-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
      <MiniPlayer bottomOffset={tabBarActualHeight} />
    </View>
  );
}
