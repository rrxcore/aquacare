import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth"; // Added for your Login screen

const firebaseConfig = {
  apiKey: "AIzaSyB3I39kwAaFMCNKfEH1TKcrTv9umsjKgAE",
  authDomain: "aquacare-dad.firebaseapp.com",
  projectId: "aquacare-dad",
  storageBucket: "aquacare-dad.firebasestorage.app",
  messagingSenderId: "654114465343",
  appId: "1:654114465343:web:47ccb10817660b6cc1fa8a",
  measurementId: "G-YMLN1TCHVW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
getAnalytics(app);

// Initialize Firebase Authentication and export it for App.js
export const auth = getAuth(app);