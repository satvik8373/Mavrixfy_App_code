import { logEvent as firebaseLogEvent } from "firebase/analytics";
import { analytics } from "./firebase";
import { Platform } from "react-native";

/**
 * Log an analytics event
 * Works on web platform with Firebase Analytics
 * For native (iOS/Android), events are logged to console for development
 */
export function logEvent(eventName: string, params?: Record<string, any>) {
  if (Platform.OS === "web") {
    if (analytics) {
      try {
        firebaseLogEvent(analytics, eventName, params);
        if (__DEV__) {
          console.log(`📊 Analytics (web): ${eventName}`, params || {});
          console.log(`🔍 Check Firebase DebugView: https://console.firebase.google.com/project/spotify-8fefc/analytics/debugview`);
        }
      } catch (error) {
        if (__DEV__) {
          console.error("❌ Analytics error:", error);
        }
      }
    } else {
      if (__DEV__) {
        console.warn("⚠️ Analytics not initialized yet:", eventName, params);
      }
    }
  } else if (__DEV__) {
    // Native: Log to console in development
    console.log(`📊 Analytics (native - logged only): ${eventName}`, params || {});
  }
}

/**
 * Log app open event
 */
export function logAppOpen() {
  logEvent("app_open");
}

/**
 * Log screen view event
 */
export function logScreenView(screenName: string, screenClass?: string) {
  logEvent("screen_view", {
    screen_name: screenName,
    screen_class: screenClass || screenName,
  });
}

/**
 * Log user login event
 */
export function logLogin(method: string) {
  logEvent("login", { method });
}

/**
 * Log user signup event
 */
export function logSignUp(method: string) {
  logEvent("sign_up", { method });
}

/**
 * Log search event
 */
export function logSearch(searchTerm: string) {
  logEvent("search", { search_term: searchTerm });
}

/**
 * Log content selection (e.g., song, playlist)
 */
export function logSelectContent(contentType: string, itemId: string) {
  logEvent("select_content", {
    content_type: contentType,
    item_id: itemId,
  });
}
