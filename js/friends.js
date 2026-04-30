// js/friends.js
import { auth, db } from './firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  deleteDoc,
  setDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { compareByName, generateBlockId, generatePairKey, generateRequestId, normalizeQuery } from './utils.js';

function currentUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Nicht eingeloggt.');
  return uid;
}

async function getUser(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

async function resolveUsersFromIds(ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const users = await Promise.all(uniqueIds.map(getUser));
  return users.filter(Boolean).sort(compareByName);
}

export async function searchUsers(term) {
  const uid = currentUid();
  const normalized = normalizeQuery(term);
  if (!normalized) return [];

  const snap = await getDocs(collection(db, 'users'));
  const users = snap.docs.map((d) => d.data()).filter(Boolean).filter((user) => user.uid !== uid);

  const scored = users
    .filter((user) => {
      const name = normalizeQuery(user.name);
      const email = normalizeQuery(user.email);
      return name.includes(normalized) || email.includes(normalized);
    })
    .map((user) => {
      const name = normalizeQuery(user.name);
      const email = normalizeQuery(user.email);
      const prefixName = name.startsWith(normalized) ? 0 : 2;
      const prefixEmail = email.startsWith(normalized) ? 1 : 3;
      return {
        user,
        score: Math.min(prefixName, prefixEmail),
        secondary: name.includes(normalized) ? 0 : 1
      };
    })
    .sort((a, b) => a.score - b.score || a.secondary - b.secondary || compareByName(a.user, b.user));

  return scored.map((entry) => entry.user);
}

export async function getRelationshipStatus(otherUid) {
  const uid = currentUid();
  if (otherUid === uid) {
    return {
      status: 'NONE',
      blockedByMe: false,
      blockedByOther: false,
      friendshipId: null,
      requestId: null,
      blockId: null
    };
  }

  const friendshipId = generatePairKey(uid, otherUid);
  const requestId = generateRequestId(uid, otherUid);
  const myBlockId = generateBlockId(uid, otherUid);
  const theirBlockId = generateBlockId(otherUid, uid);

  const [friendshipSnap, requestSnap, myBlockSnap, theirBlockSnap] = await Promise.all([
    getDoc(doc(db, 'friendships', friendshipId)),
    getDoc(doc(db, 'friendRequests', requestId)),
    getDoc(doc(db, 'blockedUsers', myBlockId)),
    getDoc(doc(db, 'blockedUsers', theirBlockId))
  ]);

  const blockedByMe = myBlockSnap.exists();
  const blockedByOther = theirBlockSnap.exists();

  if (blockedByMe || blockedByOther) {
    return {
      status: 'BLOCKED',
      blockedByMe,
      blockedByOther,
      friendshipId,
      requestId: requestSnap.exists() ? requestId : null,
      blockId: blockedByMe ? myBlockId : theirBlockId
    };
  }

  if (friendshipSnap.exists()) {
    return {
      status: 'FRIENDS',
      blockedByMe: false,
      blockedByOther: false,
      friendshipId,
      requestId: null,
      blockId: null
    };
  }

  if (requestSnap.exists()) {
    const data = requestSnap.data();
    return {
      status: data.fromUid === uid ? 'REQUEST_SENT' : 'REQUEST_RECEIVED',
      blockedByMe: false,
      blockedByOther: false,
      friendshipId: null,
      requestId,
      blockId: null,
      request: data
    };
  }

  return {
    status: 'NONE',
    blockedByMe: false,
    blockedByOther: false,
    friendshipId: null,
    requestId: null,
    blockId: null
  };
}

export async function sendRequest(targetUid) {
  const uid = currentUid();
  if (targetUid === uid) throw new Error('An dich selbst kann keine Anfrage gesendet werden.');

  const requestId = generateRequestId(uid, targetUid);
  const friendshipId = generatePairKey(uid, targetUid);
  const myBlockId = generateBlockId(uid, targetUid);
  const theirBlockId = generateBlockId(targetUid, uid);

  await runTransaction(db, async (transaction) => {
    const [requestSnap, friendshipSnap, myBlockSnap, theirBlockSnap] = await Promise.all([
      transaction.get(doc(db, 'friendRequests', requestId)),
      transaction.get(doc(db, 'friendships', friendshipId)),
      transaction.get(doc(db, 'blockedUsers', myBlockId)),
      transaction.get(doc(db, 'blockedUsers', theirBlockId))
    ]);

    if (myBlockSnap.exists() || theirBlockSnap.exists()) {
      throw new Error('Kontakt ist blockiert.');
    }

    if (friendshipSnap.exists()) {
      throw new Error('Ihr seid bereits Freunde.');
    }

    if (requestSnap.exists()) {
      const data = requestSnap.data();
      if (data.fromUid === uid) {
        throw new Error('Anfrage bereits gesendet.');
      }
      throw new Error('Es liegt bereits eine Anfrage vor. Bitte annehmen.');
    }

    transaction.set(doc(db, 'friendRequests', requestId), {
      fromUid: uid,
      toUid: targetUid,
      status: 'pending',
      createdAt: serverTimestamp()
    });
  });
}

export async function cancelRequest(targetUid) {
  const uid = currentUid();
  const requestRef = doc(db, 'friendRequests', generateRequestId(uid, targetUid));
  const snap = await getDoc(requestRef);
  if (!snap.exists()) return;

  const data = snap.data();
  if (data.fromUid !== uid) throw new Error('Diese Anfrage kannst du nicht zurückziehen.');
  await deleteDoc(requestRef);
}

export async function acceptRequest(fromUid) {
  const uid = currentUid();
  const requestId = generateRequestId(uid, fromUid);
  const requestRef = doc(db, 'friendRequests', requestId);
  const friendshipRef = doc(db, 'friendships', generatePairKey(uid, fromUid));

  await runTransaction(db, async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists()) {
      throw new Error('Anfrage nicht gefunden.');
    }

    const requestData = requestSnap.data();
    if (requestData.toUid !== uid) {
      throw new Error('Diese Anfrage gehört nicht dir.');
    }

    const friendshipSnap = await transaction.get(friendshipRef);
    if (friendshipSnap.exists()) {
      transaction.delete(requestRef);
      return;
    }

    transaction.set(friendshipRef, {
      members: [uid, fromUid].sort(),
      createdAt: serverTimestamp()
    });

    transaction.delete(requestRef);
  });
}

export async function rejectRequest(fromUid) {
  const uid = currentUid();
  const requestRef = doc(db, 'friendRequests', generateRequestId(uid, fromUid));
  const snap = await getDoc(requestRef);
  if (!snap.exists()) return;

  const data = snap.data();
  if (data.toUid !== uid) throw new Error('Diese Anfrage gehört nicht dir.');
  await deleteDoc(requestRef);
}

export async function removeFriend(otherUid) {
  const uid = currentUid();
  const friendshipRef = doc(db, 'friendships', generatePairKey(uid, otherUid));
  const snap = await getDoc(friendshipRef);
  if (!snap.exists()) return;
  await deleteDoc(friendshipRef);
}

export async function blockUser(otherUid) {
  const uid = currentUid();
  if (otherUid === uid) throw new Error('Du kannst dich nicht selbst blockieren.');

  const blockRef = doc(db, 'blockedUsers', generateBlockId(uid, otherUid));
  const friendshipRef = doc(db, 'friendships', generatePairKey(uid, otherUid));
  const requestRef = doc(db, 'friendRequests', generateRequestId(uid, otherUid));

  await runTransaction(db, async (transaction) => {
    transaction.set(blockRef, {
      blockerUid: uid,
      blockedUid: otherUid,
      createdAt: serverTimestamp()
    });

    transaction.delete(friendshipRef);
    transaction.delete(requestRef);
  });
}

export async function unblockUser(otherUid) {
  const uid = currentUid();
  const blockRef = doc(db, 'blockedUsers', generateBlockId(uid, otherUid));
  const snap = await getDoc(blockRef);
  if (!snap.exists()) return;

  const data = snap.data();
  if (data.blockerUid !== uid) throw new Error('Diese Blockierung kannst du nicht entfernen.');
  await deleteDoc(blockRef);
}

export async function loadFriends() {
  const uid = currentUid();
  const snap = await getDocs(query(collection(db, 'friendships'), where('members', 'array-contains', uid)));
  const friendIds = snap.docs.map((docSnap) => {
    const members = docSnap.data().members || [];
    return members.find((member) => member !== uid);
  }).filter(Boolean);
  return resolveUsersFromIds(friendIds);
}

export async function loadIncomingRequests() {
  const uid = currentUid();
  const snap = await getDocs(query(collection(db, 'friendRequests'), where('toUid', '==', uid), where('status', '==', 'pending')));
  const fromIds = snap.docs.map((docSnap) => docSnap.data().fromUid).filter(Boolean);
  return resolveUsersFromIds(fromIds);
}

export async function loadOutgoingRequests() {
  const uid = currentUid();
  const snap = await getDocs(query(collection(db, 'friendRequests'), where('fromUid', '==', uid), where('status', '==', 'pending')));
  const toIds = snap.docs.map((docSnap) => docSnap.data().toUid).filter(Boolean);
  return resolveUsersFromIds(toIds);
}

export async function loadBlockedUsers() {
  const uid = currentUid();
  const snap = await getDocs(query(collection(db, 'blockedUsers'), where('blockerUid', '==', uid)));
  const blockedIds = snap.docs.map((docSnap) => docSnap.data().blockedUid).filter(Boolean);
  return resolveUsersFromIds(blockedIds);
}

export function listenFriends(callback) {
  const uid = currentUid();
  const q = query(collection(db, 'friendships'), where('members', 'array-contains', uid));
  return onSnapshot(q, async (snap) => {
    const ids = snap.docs.map((docSnap) => {
      const members = docSnap.data().members || [];
      return members.find((member) => member !== uid);
    }).filter(Boolean);
    callback(await resolveUsersFromIds(ids));
  });
}

export function listenIncomingRequests(callback) {
  const uid = currentUid();
  const q = query(collection(db, 'friendRequests'), where('toUid', '==', uid), where('status', '==', 'pending'));
  return onSnapshot(q, async (snap) => {
    const ids = snap.docs.map((docSnap) => docSnap.data().fromUid).filter(Boolean);
    callback(await resolveUsersFromIds(ids));
  });
}

export function listenOutgoingRequests(callback) {
  const uid = currentUid();
  const q = query(collection(db, 'friendRequests'), where('fromUid', '==', uid), where('status', '==', 'pending'));
  return onSnapshot(q, async (snap) => {
    const ids = snap.docs.map((docSnap) => docSnap.data().toUid).filter(Boolean);
    callback(await resolveUsersFromIds(ids));
  });
}

export function listenBlockedUsers(callback) {
  const uid = currentUid();
  const q = query(collection(db, 'blockedUsers'), where('blockerUid', '==', uid));
  return onSnapshot(q, async (snap) => {
    const ids = snap.docs.map((docSnap) => docSnap.data().blockedUid).filter(Boolean);
    callback(await resolveUsersFromIds(ids));
  });
}