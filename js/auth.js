// js/auth.js
import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile as updateAuthProfile
} from "https://www.gstatic.com/firebase 9.22.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

async function ensureUserDocument(user, extra = {}) {
  if (!user) return;

  const userRef = doc(db, 'users', user.uid);
  const snapshot = await getDoc(userRef);

  const baseData = {
    uid: user.uid,
    name: user.displayName || extra.name || '',
    email: user.email || extra.email || '',
    photoURL: user.photoURL || extra.photoURL || '',
    bio: extra.bio || '',
    online: true
  };

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      ...baseData,
      createdAt: serverTimestamp()
    });
    return;
  }

  await updateDoc(userRef, {
    ...baseData,
    online: true
  });
}

export async function register(name, email, password, photoURL = '', bio = '') {
  const cleanName = String(name ?? '').trim();
  const cleanEmail = String(email ?? '').trim();
  const cleanPhotoURL = String(photoURL ?? '').trim();
  const cleanBio = String(bio ?? '').trim();

  if (!cleanName) throw new Error('Name ist erforderlich.');
  if (!cleanEmail) throw new Error('E-Mail ist erforderlich.');
  if (!password || password.length < 6) throw new Error('Passwort muss mindestens 6 Zeichen haben.');

  const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);

  if (cleanName || cleanPhotoURL) {
    await updateAuthProfile(credential.user, {
      displayName: cleanName,
      photoURL: cleanPhotoURL
    });
  }

  await ensureUserDocument(credential.user, {
    name: cleanName,
    email: cleanEmail,
    photoURL: cleanPhotoURL,
    bio: cleanBio
  });

  return credential.user;
}

export async function login(email, password) {
  const cleanEmail = String(email ?? '').trim();
  if (!cleanEmail) throw new Error('E-Mail ist erforderlich.');
  if (!password) throw new Error('Passwort ist erforderlich.');
  const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
  await ensureUserDocument(credential.user);
  return credential.user;
}

export async function logout() {
  const user = auth.currentUser;
  if (user) {
    try {
      await updateDoc(doc(db, 'users', user.uid), { online: false });
    } catch (_) {
      // bewusst still: Logout darf nicht an einem Status-Write hängen.
    }
  }
  await signOut(auth);
}

export function authStateListener(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      await ensureUserDocument(user);
      callback(user);
      return;
    }
    callback(null);
  });
}