import React from "react";
import { View, Text, Pressable, StyleSheet, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
  const { logout } = useAuth();

  const handleLogout = async () => {
    onClose();
    await logout();
    router.replace("/login");
  };

  const handleSettings = () => {
    onClose();
    // Settings page doesn't exist yet, could navigate to library or show toast
    router.push("/(tabs)/library");
  };

  const handleAccount = () => {
    onClose();
    // Account page doesn't exist yet, could show user info
    router.push("/(tabs)/library");
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
          <Pressable style={styles.menuItem} onPress={handleAccount}>
            <Ionicons name="person-outline" size={20} color={Colors.text} />
            <Text style={styles.menuText}>Account</Text>
          </Pressable>

          <Pressable style={styles.menuItem} onPress={handleSettings}>
            <Ionicons name="settings-outline" size={20} color={Colors.text} />
            <Text style={styles.menuText}>Settings</Text>
          </Pressable>

          <View style={styles.divider} />

          <Pressable style={styles.menuItem} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={Colors.text} />
            <Text style={styles.menuText}>Log out</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  dropdown: {
    position: "absolute",
    top: 60,
    right: 16,
    backgroundColor: "#282828",
    borderRadius: 8,
    minWidth: 180,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  menuText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceLight,
    marginVertical: 4,
  },
});
