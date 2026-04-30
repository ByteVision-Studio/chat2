// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";

// Firebase Config hier einfügen.
const firebaseConfig = {
  apiKey: "AIzaSyB-XYFaoDULLeUQ2ApzMuXj1chI8IfugHw",
  authDomain: "chat-eb747.firebaseapp.com",
  projectId: "chat-eb747",
  storageBucket: "chat-eb747.firebasestorage.app",
  messagingSenderId: "250881349329",
  appId: "1:250881349329:web:02fc61b7eedff6955c97f0"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;