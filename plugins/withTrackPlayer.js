const { withAndroidManifest, withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Expo config plugin for react-native-track-player
 * Adds required Android configuration
 */
function withTrackPlayer(config) {
  // Add Android manifest configuration
  config = withAndroidManifest(config, (config) => {
    const { manifest } = config.modResults;

    // Add FOREGROUND_SERVICE permission if not already present
    if (!manifest.$ ['uses-permission']) {
      manifest.$['uses-permission'] = [];
    }

    const permissions = manifest.$['uses-permission'];
    const hasForegroundService = permissions.some(
      (perm) => perm.$['android:name'] === 'android.permission.FOREGROUND_SERVICE'
    );

    if (!hasForegroundService) {
      permissions.push({
        $: {
          'android:name': 'android.permission.FOREGROUND_SERVICE',
        },
      });
    }

    // Add service to application
    if (!manifest.application) {
      manifest.application = [{}];
    }

    const application = manifest.application[0];

    if (!application.service) {
      application.service = [];
    }

    // Add MusicService
    const hasMusicService = application.service.some(
      (service) =>
        service.$['android:name'] === 'com.doublesymmetry.trackplayer.service.MusicService'
    );

    if (!hasMusicService) {
      application.service.push({
        $: {
          'android:name': 'com.doublesymmetry.trackplayer.service.MusicService',
          'android:foregroundServiceType': 'mediaPlayback',
          'android:exported': 'false',
        },
      });
    }

    return config;
  });

  // Add Gradle configuration
  config = withAppBuildGradle(config, (config) => {
    // Ensure compileSdkVersion is at least 31 for foregroundServiceType
    if (config.modResults.contents.includes('compileSdkVersion')) {
      config.modResults.contents = config.modResults.contents.replace(
        /compileSdkVersion\s+\d+/,
        'compileSdkVersion 34'
      );
    }

    return config;
  });

  return config;
}

module.exports = withTrackPlayer;
