import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";

import { auth } from "./client";

export const signIn = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const createAccount = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password);

export const resetPassword = (email: string) =>
  sendPasswordResetEmail(auth, email);

export const logout = () => signOut(auth);

export const observeAuth = (
  callback: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, callback);
};