import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthApiUrl } from "@/lib/api-config";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, register, signInWithGoogle, signInWithGoogleCredential, continueAsGuest } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (!isLogin && !fullName.trim()) {
      Alert.alert("Error", "Please enter your full name");
      return;
    }
    if (!isLogin && password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, fullName.trim());
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (error: any) {
      const msg = error.message || "Something went wrong";
      const friendlyMsg = msg.includes("user-not-found") ? "No account found with this email"
        : msg.includes("wrong-password") || msg.includes("invalid-credential") ? "Incorrect password"
        : msg.includes("email-already-in-use") ? "An account with this email already exists"
        : msg.includes("invalid-email") ? "Please enter a valid email address"
        : msg;
      Alert.alert("Error", friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (Platform.OS === "web") {
      setGoogleLoading(true);
      try {
        await signInWithGoogle();
        router.replace("/(tabs)");
      } catch (error: any) {
        Alert.alert("Error", error.message || "Google Sign-In failed");
      } finally {
        setGoogleLoading(false);
      }
      return;
    }

    setGoogleLoading(true);
    try {
      const returnUrl = Linking.createURL("google-auth");
      const apiUrl = getAuthApiUrl();
      const authUrl = `${apiUrl}api/auth/google-mobile?returnUrl=${encodeURIComponent(returnUrl)}`;

      console.log("🔍 Google Sign-In Debug:");
      console.log("Return URL:", returnUrl);
      console.log("API URL:", apiUrl);
      console.log("Auth URL:", authUrl);

      const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);

      console.log("WebBrowser result type:", result.type);
      console.log("WebBrowser result:", JSON.stringify(result, null, 2));

      if (result.type === "success" && result.url) {
        console.log("✅ Success! Redirect URL:", result.url);
        
        const parsedUrl = Linking.parse(result.url);
        console.log("Parsed URL:", JSON.stringify(parsedUrl, null, 2));
        console.log("Query params:", JSON.stringify(parsedUrl.queryParams, null, 2));
        
        const idToken = parsedUrl.queryParams?.id_token as string | undefined;

        if (idToken) {
          console.log("✅ Got ID token, length:", idToken.length);
          await signInWithGoogleCredential(idToken);
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace("/(tabs)");
        } else {
          console.log("❌ No ID token in URL");
          console.log("Available params:", Object.keys(parsedUrl.queryParams || {}));
          Alert.alert("Error", "Could not complete Google Sign-In. No token received.");
        }
      } else if (result.type === "cancel") {
        console.log("⚠️ User cancelled sign-in");
        Alert.alert("Cancelled", "Google Sign-In was cancelled");
      } else {
        console.log("❌ Unexpected result type:", result.type);
        Alert.alert("Error", "Could not complete Google Sign-In. Please try again.");
      }
    } catch (error: any) {
      console.error("❌ Google Sign-In error:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      Alert.alert("Error", error.message || "Google Sign-In failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGuest = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    continueAsGuest();
    router.replace("/(tabs)");
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <LinearGradient
        colors={["#1a1a2e", "#16213e", "#0f3460", Colors.background]}
        locations={[0, 0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              <Ionicons name="musical-notes" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.logoText}>Mavrixfy</Text>
            <Text style={styles.tagline}>Your music, everywhere</Text>
          </View>

          <View style={styles.formCard}>
            <View style={styles.tabRow}>
              <Pressable
                style={[styles.tab, isLogin && styles.tabActive]}
                onPress={() => setIsLogin(true)}
              >
                <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Log in</Text>
              </Pressable>
              <Pressable
                style={[styles.tab, !isLogin && styles.tabActive]}
                onPress={() => setIsLogin(false)}
              >
                <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Sign up</Text>
              </Pressable>
            </View>

            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="person-outline" size={18} color={Colors.inactive} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your name"
                    placeholderTextColor={Colors.inactive}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    selectionColor={Colors.primary}
                  />
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={18} color={Colors.inactive} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor={Colors.inactive}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  selectionColor={Colors.primary}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.inactive} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Enter your password"
                  placeholderTextColor={Colors.inactive}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  selectionColor={Colors.primary}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={Colors.inactive}
                  />
                </Pressable>
              </View>
            </View>

            <Pressable
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.black} />
              ) : (
                <Text style={styles.submitBtnText}>{isLogin ? "Log in" : "Create account"}</Text>
              )}
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={[styles.socialBtn, googleLoading && styles.submitBtnDisabled]}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color={Colors.text} />
              ) : (
                <MaterialCommunityIcons name="google" size={20} color={Colors.text} />
              )}
              <Text style={styles.socialBtnText}>
                {googleLoading ? "Signing in..." : "Continue with Google"}
              </Text>
            </Pressable>

            <Pressable style={styles.guestBtn} onPress={handleGuest}>
              <Ionicons name="person-outline" size={20} color={Colors.subtext} />
              <Text style={styles.guestBtnText}>Continue as Guest</Text>
            </Pressable>

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>
                {isLogin ? "Don't have an account?" : "Already have an account?"}
              </Text>
              <Pressable onPress={() => setIsLogin(!isLogin)}>
                <Text style={styles.switchLink}>{isLogin ? "Sign up" : "Log in"}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
  logoSection: { alignItems: "center", marginTop: 40, marginBottom: 32 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(29,185,84,0.15)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  logoText: {
    fontSize: 32, fontFamily: "Inter_700Bold", color: Colors.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.subtext,
    marginTop: 4,
  },
  formCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  tabRow: {
    flexDirection: "row", marginBottom: 24,
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12,
    padding: 3,
  },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
  },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.subtext },
  tabTextActive: { color: Colors.black },
  inputGroup: { marginBottom: 16 },
  inputLabel: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.subtext,
    marginBottom: 6, marginLeft: 4,
  },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12, paddingHorizontal: 14, height: 48,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1, color: Colors.text, fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  passwordInput: { paddingRight: 4 },
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    height: 50, alignItems: "center", justifyContent: "center",
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: {
    fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.black,
  },
  divider: {
    flexDirection: "row", alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.1)" },
  dividerText: {
    fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.inactive,
    marginHorizontal: 16,
  },
  socialBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    height: 48, borderRadius: 12, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)", marginBottom: 10, gap: 10,
  },
  socialBtnText: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text,
  },
  guestBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    height: 48, borderRadius: 12, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)", gap: 10,
  },
  guestBtnText: {
    fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.subtext,
  },
  switchRow: {
    flexDirection: "row", justifyContent: "center",
    marginTop: 20, gap: 4,
  },
  switchText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.subtext },
  switchLink: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.text },
});
