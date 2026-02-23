import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { updateService } from '@/lib/update-service';
import type { VersionCheckResult } from '@/lib/version-utils';

export function useAppUpdate() {
  const [updateInfo, setUpdateInfo] = useState<VersionCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showModal, setShowModal] = useState(false);

  /**
   * Check for updates
   */
  const checkForUpdates = useCallback(async (force: boolean = false) => {
    setIsChecking(true);
    try {
      const result = await updateService.checkForUpdates(force);
      
      if (result && result.updateAvailable) {
        setUpdateInfo(result);
        setShowModal(true);
      } else if (force && result) {
        // Show "up to date" message only when manually checking
        setUpdateInfo(result);
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
    } finally {
      setIsChecking(false);
    }
  }, []);

  /**
   * Handle update button press
   */
  const handleUpdate = useCallback(() => {
    if (updateInfo) {
      updateService.openUpdateUrl(updateInfo.updateUrl);
      if (!updateInfo.forceUpdate) {
        setShowModal(false);
      }
    }
  }, [updateInfo]);

  /**
   * Handle close modal
   */
  const handleClose = useCallback(() => {
    if (updateInfo && !updateInfo.forceUpdate) {
      setShowModal(false);
    }
  }, [updateInfo]);

  /**
   * Check on app start
   */
  useEffect(() => {
    checkForUpdates(false);
  }, [checkForUpdates]);

  /**
   * Check when app comes to foreground
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkForUpdates(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkForUpdates]);

  return {
    updateInfo,
    isChecking,
    showModal,
    checkForUpdates,
    handleUpdate,
    handleClose,
  };
}
