import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { logLogin, logSignUp } from "@/lib/analytics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

interface AppUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

interface AuthContextValue {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleCredential: (idToken: string) => Promise<void>;
  continueAsGuest: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const GUEST_KEY = "mavrixfy_guest_mode";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const buildAppUser = useCallback(async (fbUser: FirebaseUser): Promise<AppUser> => {
    let name = fbUser.displayName || "";
    let picture = fbUser.photoURL || "";

    try {
      const userDoc = await getDoc(doc(db, "users", fbUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        name = data.fullName || data.displayName || name;
        picture = data.imageUrl || data.photoURL || picture;
      }
    } catch {}

    return {
      id: fbUser.uid,
      email: fbUser.email || "",
      name,
      picture,
    };
  }, []);

  useEffect(() => {
    const checkGuest = async () => {
      try {
        const guestMode = await AsyncStorage.getItem(GUEST_KEY);
        if (guestMode === "true") setIsGuest(true);
      } catch {}
    };
    checkGuest();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        const appUser = await buildAppUser(fbUser);
        setUser(appUser);
        setIsGuest(false);
        await AsyncStorage.removeItem(GUEST_KEY);
      } else {
        setFirebaseUser(null);
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [buildAppUser]);

  const login = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const appUser = await buildAppUser(cred.user);
    setUser(appUser);
    setFirebaseUser(cred.user);
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
    logLogin("email");
  }, [buildAppUser]);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      fullName,
      imageUrl: null,
      createdAt: new Date().toISOString(),
    });
    const appUser: AppUser = {
      id: cred.user.uid,
      email,
      name: fullName,
      picture: "",
    };
    setUser(appUser);
    setFirebaseUser(cred.user);
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
    logSignUp("email");
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS === "web") {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;
      const userDocRef = doc(db, "users", fbUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        await setDoc(userDocRef, {
          email: fbUser.email,
          fullName: fbUser.displayName || "",
          imageUrl: fbUser.photoURL || null,
          uid: fbUser.uid,
          createdAt: new Date().toISOString(),
        });
        logSignUp("google");
      } else {
        logLogin("google");
      }
      const appUser = await buildAppUser(fbUser);
      setUser(appUser);
      setFirebaseUser(fbUser);
      setIsGuest(false);
      await AsyncStorage.removeItem(GUEST_KEY);
    } else {
      throw new Error("Google Sign-In on native requires expo-auth-session. Use the mobile Google Sign-In button instead.");
    }
  }, [buildAppUser]);

  const signInWithGoogleCredential = useCallback(async (idToken: string) => {
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    const fbUser = result.user;
    const userDocRef = doc(db, "users", fbUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) {
      await setDoc(userDocRef, {
        email: fbUser.email,
        fullName: fbUser.displayName || "",
        imageUrl: fbUser.photoURL || null,
        uid: fbUser.uid,
        createdAt: new Date().toISOString(),
      });
      logSignUp("google");
    } else {
      logLogin("google");
    }
    const appUser = await buildAppUser(fbUser);
    setUser(appUser);
    setFirebaseUser(fbUser);
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
  }, [buildAppUser]);

  const continueAsGuest = useCallback(async () => {
    setIsGuest(true);
    setUser(null);
    setFirebaseUser(null);
    await AsyncStorage.setItem(GUEST_KEY, "true");
  }, []);

  const logout = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch {}
    setUser(null);
    setFirebaseUser(null);
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
  }, []);

  const refreshUser = useCallback(async () => {
    if (auth.currentUser) {
      const appUser = await buildAppUser(auth.currentUser);
      setUser(appUser);
    }
  }, [buildAppUser]);

  const value = useMemo(() => ({
    user,
    firebaseUser,
    loading,
    isAuthenticated: !!user,
    isGuest,
    login,
    register,
    signInWithGoogle,
    signInWithGoogleCredential,
    continueAsGuest,
    logout,
    refreshUser,
  }), [user, firebaseUser, loading, isGuest, login, register, signInWithGoogle, signInWithGoogleCredential, continueAsGuest, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
