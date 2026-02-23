import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

interface UpdateBannerProps {
  downloadUrl: string;
}

export default function UpdateBanner({ downloadUrl }: UpdateBannerProps) {
  const [visible, setVisible] = useState(true);

  const handleDownload = () => {
    Alert.alert(
      'Download Update',
      'Version 1.1.0 includes lock screen controls and background playback. Download now?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => {
            Linking.openURL(downloadUrl);
          },
        },
      ]
    );
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.content}>
        <Ionicons name="information-circle" size={24} color={Colors.primary} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>New Version Available!</Text>
          <Text style={styles.subtitle}>Version 1.1.0 with lock screen controls</Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <Pressable style={styles.dismissButton} onPress={handleDismiss}>
          <Ionicons name="close" size={20} color={Colors.subtext} />
        </Pressable>
        <Pressable style={styles.downloadButton} onPress={handleDownload}>
          <Text style={styles.buttonText}>Download</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  textContainer: {
    marginLeft: 12,
    flex: 1,
  },
  title: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  subtitle: {
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dismissButton: {
    padding: 4,
  },
  downloadButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonText: {
    color: Colors.black,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
