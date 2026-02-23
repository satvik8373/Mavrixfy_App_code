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
  Image,
  Dimensions,
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

const { width, height } = Dimensions.get("window");

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, register, signInWithGoogle, signInWithGoogleCredential, continueAsGuest } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [showSignupForm, setShowSignupForm] = useState(false);
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
    if (showSignupForm && !fullName.trim()) {
      Alert.alert("Error", "Please enter your full name");
      return;
    }
    if (showSignupForm && password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      if (showSignupForm) {
        await register(email.trim(), password, fullName.trim());
      } else {
        await login(email.trim(), password);
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

        const queryParams = parsedUrl.queryParams as Record<string, string | undefined> | undefined;
        const idToken = queryParams?.id_token;

        if (idToken) {
          console.log("✅ Got ID token, length:", idToken.length);
          await signInWithGoogleCredential(idToken);
          if (Platform.OS !== ("web" as string)) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    if (Platform.OS !== ("web" as string)) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    continueAsGuest();
    router.replace("/(tabs)");
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <LinearGradient
        colors={["#121212", "#1a1a1a", "#0a0a0a"]}
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
          {!showSignupForm ? (
            // Main Login Screen
            <View style={styles.mainContent}>
              {/* Hero Section with Artist Images */}
              <View style={styles.heroSection}>
                <View style={styles.circleGrid}>
                  {/* Artist/Album Images from internet */}
                  <View style={[styles.artistCircle, { top: 10, left: 20 }]}>
                    <Image
                      source={{ uri: "https://i.scdn.co/image/ab67616d0000b273e787cffec20aa2a396a61647" }}
                      style={styles.circleImage}
                    />
                  </View>
                  <View style={[styles.artistCircle, { top: 20, left: 120 }]}>
                    <Image
                      source={{ uri: "https://i.scdn.co/image/ab6761610000e5eb0c68f6c95232e716f0abee8d" }}
                      style={styles.circleImage}
                    />
                  </View>
                  <View style={[styles.artistCircle, { top: 10, right: 20 }]}>
                    <Image
                      source={{ uri: "https://i.scdn.co/image/ab6761610000e5eb8ae7f2aaa9817a704a87ea36" }}
                      style={styles.circleImage}
                    />
                  </View>
                  <View style={[styles.artistCircle, { top: 100, left: 10 }]}>
                    <Image
                      source={{ uri: "https://i.scdn.co/image/ab6761610000e5eb40b5c07ab77b6b1a9075fdc0" }}
                      style={styles.circleImage}
                    />
                  </View>
                  <View style={[styles.artistCircle, { top: 120, left: 140 }]}>
                    <Image
                      source={{ uri: "https://i.scdn.co/image/ab6761610000e5eb12d5ab979779aa0c87a8c8c0" }}
                      style={styles.circleImage}
                    />
                  </View>
                  <View style={[styles.artistCircle, { top: 100, right: 30 }]}>
                    <Image
                      source={{ uri: "https://i.scdn.co/image/ab6761610000e5eb6a224073987b930f99adc706" }}
                      style={styles.circleImage}
                    />
                  </View>
                </View>

                {/* Mavrixfy Logo */}
                <View style={styles.logoCircle}>
                  <Image
                    source={require("@/assets/images/icon.png")}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
              </View>

              {/* Title */}
              <View style={styles.titleSection}>
                <Text style={styles.heroTitle}>Millions of songs.</Text>
                <Text style={styles.heroTitle}>Free on Mavrixfy.</Text>
              </View>

              {/* Google Sign In */}
              <Pressable
                style={styles.googleBtn}
                onPress={handleGoogleSignIn}
                disabled={googleLoading}
              >
                {googleLoading ? (
                  <ActivityIndicator size="small" color={Colors.black} />
                ) : (
                  <>
                    <View style={styles.googleIconCircle}>
                      <MaterialCommunityIcons name="google" size={20} color="#DB4437" />
                    </View>
                    <Text style={styles.googleBtnText}>Continue with Google</Text>
                  </>
                )}
              </Pressable>

              {/* Guest Button */}
              <Pressable style={styles.guestBtn} onPress={handleGuest}>
                <Text style={styles.guestBtnText}>Continue as Guest</Text>
              </Pressable>

              {/* Login Form */}
              <View style={styles.formSection}>
                <View style={styles.inputGroup}>
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor={Colors.inactive}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    selectionColor={Colors.primary}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Password"
                      placeholderTextColor={Colors.inactive}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      selectionColor={Colors.primary}
                    />
                    <Pressable
                      style={styles.eyeIcon}
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={10}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={Colors.inactive}
                      />
                    </Pressable>
                  </View>
                </View>

                <Pressable style={styles.forgotPassword}>
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </Pressable>

                <Pressable
                  style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={Colors.black} />
                  ) : (
                    <Text style={styles.loginBtnText}>Log In</Text>
                  )}
                </Pressable>

                <View style={styles.signupPrompt}>
                  <Text style={styles.signupPromptText}>Don't have an account? </Text>
                  <Pressable onPress={() => setShowSignupForm(true)}>
                    <Text style={styles.signupLink}>Sign up</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            // Signup Form
            <View style={styles.signupContent}>
              <Pressable
                style={styles.backButton}
                onPress={() => {
                  setShowSignupForm(false);
                  setEmail("");
                  setPassword("");
                  setFullName("");
                }}
              >
                <Ionicons name="arrow-back" size={24} color={Colors.text} />
              </Pressable>

              <View style={styles.signupHeader}>
                <Text style={styles.signupTitle}>Create your account</Text>
              </View>

              <View style={styles.signupForm}>
                <View style={styles.inputGroup}>
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor={Colors.inactive}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    selectionColor={Colors.primary}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor={Colors.inactive}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    selectionColor={Colors.primary}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Password"
                      placeholderTextColor={Colors.inactive}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      selectionColor={Colors.primary}
                    />
                    <Pressable
                      style={styles.eyeIcon}
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={10}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={Colors.inactive}
                      />
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={Colors.black} />
                  ) : (
                    <Text style={styles.loginBtnText}>Sign Up</Text>
                  )}
                </Pressable>

                <View style={styles.signupPrompt}>
                  <Text style={styles.signupPromptText}>Already have an account? </Text>
                  <Pressable onPress={() => setShowSignupForm(false)}>
                    <Text style={styles.signupLink}>Log in</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // Main Content
  mainContent: {
    flex: 1,
    paddingHorizontal: 24,
  },

  // Hero Section with Colorful Circles
  heroSection: {
    height: 240,
    marginBottom: 20,
    position: "relative",
  },
  circleGrid: {
    flex: 1,
    position: "relative",
  },
  artistCircle: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    overflow: "hidden",
  },
  circleImage: {
    width: "100%",
    height: "100%",
  },
  logoCircle: {
    position: "absolute",
    bottom: 20,
    left: "50%",
    marginLeft: -40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.text,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    overflow: "hidden",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },

  // Title Section
  titleSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  heroTitle: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    lineHeight: 38,
  },

  // Google Button
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.text,
    borderRadius: 25,
    height: 50,
    marginBottom: 12,
    gap: 12,
  },
  googleIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  googleBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.black,
  },

  // Guest Button
  guestBtn: {
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    marginBottom: 24,
  },
  guestBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },

  // Form Section
  formSection: {
    gap: 10,
  },
  inputGroup: {
    marginBottom: 10,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 48,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  passwordContainer: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeIcon: {
    position: "absolute",
    right: 16,
    top: 14,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: 6,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 25,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.black,
  },
  signupPrompt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  signupPromptText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
  },
  signupLink: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textDecorationLine: "underline",
  },

  // Signup Screen
  signupContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 10,
    justifyContent: "center",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  signupHeader: {
    marginBottom: 24,
  },
  signupTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  signupForm: {
    gap: 10,
  },
});
