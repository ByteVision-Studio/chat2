// js/profile.js
import { auth, db, storage } from './firebase.js';
import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import {
  updateProfile as updateAuthProfile
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";

function currentUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Nicht eingeloggt.');
  return uid;
}

export async function loadProfile(uid = currentUid()) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    return {
      uid,
      name: auth.currentUser?.displayName || '',
      email: auth.currentUser?.email || '',
      photoURL: auth.currentUser?.photoURL || '',
      bio: '',
      createdAt: null,
      online: false
    };
  }
  return snap.data();
}

export async function updateProfile(data) {
  const uid = currentUid();
  const name = String(data?.name ?? '').trim();
  const bio = String(data?.bio ?? '').trim();
  const photoURL = String(data?.photoURL ?? '').trim();

  await updateDoc(doc(db, 'users', uid), {
    name,
    bio,
    photoURL
  });

  await updateAuthProfile(auth.currentUser, {
    displayName: name,
    photoURL
  });
}

export async function uploadProfileImage(file) {
  const uid = currentUid();

  if (!file) {
    throw new Error('Keine Datei ausgewählt.');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Nur Bilder sind erlaubt.');
  }

  const storageRef = ref(storage, `profile-images/${uid}/${Date.now()}-${file.name}`);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}