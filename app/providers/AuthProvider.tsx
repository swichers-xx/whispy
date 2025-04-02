'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

// Define the shape of our auth context
interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateUserProfile: (displayName: string) => Promise<void>;
}

// Create the auth context with a default value
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  updateUserProfile: async () => {}
});

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);

// Provider component that wraps app and makes auth object available to any child component that calls useAuth()
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  // Sign up with email and password
  const signUp = async (email: string, password: string, displayName: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Update the user's profile with the display name
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName });
      }
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  };

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  // Update user profile
  const updateUserProfile = async (displayName: string) => {
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName });
        // Force a refresh of the user object
        setUser({ ...auth.currentUser });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    updateUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
