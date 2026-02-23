import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { VersionCheckResult } from '@/lib/version-utils';

interface UpdateModalProps {
  visible: boolean;
  versionInfo: VersionCheckResult | null;
  onClose: () => void;
  onUpdate: () => void;
}

const { width, height } = Dimensions.get('window');

export const UpdateModal: React.FC<UpdateModalProps> = ({
  visible,
  versionInfo,
  onClose,
  onUpdate,
}) => {
  if (!versionInfo) return null;

  const { forceUpdate, message, latestVersion, currentVersion, changelog, features } = versionInfo;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={forceUpdate ? undefined : onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header with gradient */}
          <LinearGradient
            colors={['#1DB954', '#1ed760', '#1DB954']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="rocket" size={48} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>
              {forceUpdate ? 'Update Required' : 'New Update Available'}
            </Text>
            <Text style={styles.versionText}>
              v{currentVersion} → v{latestVersion}
            </Text>
          </LinearGradient>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Message */}
            <Text style={styles.message}>{message}</Text>

            {/* Features */}
            {features && features.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>✨ What's New</Text>
                {features.map((feature, index) => (
                  <View key={index} style={styles.featureItem}>
                    <View style={styles.featureDot} />
                    <View style={styles.featureContent}>
                      <Text style={styles.featureTitle}>{feature.title}</Text>
                      <Text style={styles.featureDescription}>{feature.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Changelog */}
            {changelog && changelog.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📝 Improvements</Text>
                {changelog.map((item, index) => (
                  <View key={index} style={styles.changelogItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#1DB954" />
                    <Text style={styles.changelogText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Force update warning */}
            {forceUpdate && (
              <View style={styles.warningBox}>
                <Ionicons name="warning" size={20} color="#ff6b6b" />
                <Text style={styles.warningText}>
                  This update is required to continue using Mavrixfy
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.updateButton]}
              onPress={onUpdate}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#1DB954', '#1ed760']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Text style={styles.updateButtonText}>
                  {forceUpdate ? 'Update Now' : 'Update'}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>

            {!forceUpdate && (
              <TouchableOpacity
                style={[styles.button, styles.laterButton]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.laterButtonText}>Maybe Later</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: Math.min(width - 40, 400),
    maxHeight: height * 0.8,
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  header: {
    padding: 32,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  versionText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  content: {
    padding: 24,
  },
  message: {
    fontSize: 16,
    color: '#b3b3b3',
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1DB954',
    marginTop: 6,
    marginRight: 12,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#b3b3b3',
    lineHeight: 20,
  },
  changelogItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  changelogText: {
    fontSize: 14,
    color: '#b3b3b3',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
  },
  warningText: {
    fontSize: 14,
    color: '#ff6b6b',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  actions: {
    padding: 24,
    paddingTop: 0,
  },
  button: {
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 12,
  },
  updateButton: {
    height: 56,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingHorizontal: 24,
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 8,
  },
  laterButton: {
    height: 48,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  laterButtonText: {
    fontSize: 15,
    color: '#b3b3b3',
    fontWeight: '600',
  },
});
