import React from "react";
import { View, Text, Pressable, StyleSheet, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

interface ProfileDropdownProps {
  visible: boolean;
  onClose: () => void;
  anchorPosition?: { top: number; right: number };
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({
  visible,
  onClose,
  anchorPosition,
}) => {
  const { logout, user, isGuest } = useAuth();

  const handleLogout = async () => {
    onClose();
    await logout();
    router.replace("/login");
  };

  const handleSettings = () => {
    onClose();
    router.push("/settings");
  };

  const handleAccount = () => {
    onClose();
    router.push("/account");
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View
          style={[
            styles.dropdown,
            anchorPosition && {
              position: "absolute",
              top: anchorPosition.top,
              right: anchorPosition.right,
            },
          ]}
        >
          {/* User Profile Section */}
          <View style={styles.profileSection}>
            {user?.picture ? (
              <Image
                source={{ uri: user.picture }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <LinearGradient
                colors={["#1DB954", "#1ed760"]}
                style={styles.avatar}
              >
                <Ionicons name="person" size={24} color="#fff" />
              </LinearGradient>
            )}
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.name || (isGuest ? "Guest User" : "Mavrixfy User")}
              </Text>
              <Text style={styles.userEmail} numberOfLines={1}>
                {user?.email || "Not signed in"}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Menu Items */}
          <Pressable 
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemPressed
            ]} 
            onPress={handleAccount}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="person-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.menuText}>Account</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.subtext} style={styles.chevron} />
          </Pressable>

          <Pressable 
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemPressed
            ]} 
            onPress={handleSettings}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="settings-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.menuText}>Settings</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.subtext} style={styles.chevron} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable 
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemPressed
            ]} 
            onPress={handleLogout}
          >
            <View style={[styles.iconContainer, styles.logoutIconContainer]}>
              <Ionicons name="log-out-outline" size={20} color="#FF6B6B" />
            </View>
            <Text style={[styles.menuText, styles.logoutText]}>Log out</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  dropdown: {
    position: "absolute",
    top: 60,
    right: 16,
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    minWidth: 260,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    backgroundColor: "rgba(29, 185, 84, 0.08)",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  userEmail: {
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuItemPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutIconContainer: {
    backgroundColor: "rgba(255, 107, 107, 0.12)",
  },
  menuText: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  logoutText: {
    color: "#FF6B6B",
  },
  chevron: {
    marginLeft: "auto",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    marginVertical: 4,
  },
});
