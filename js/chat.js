// js/chat.js (KOMPLETT ERSETZEN)

import { auth, db } from './firebase.js';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { formatDate, generatePairKey, safeText } from './utils.js';

let activeChatId = null;
let activePeerUid = null;
let messagesUnsubscribe = null;

function currentUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Nicht eingeloggt.');
  return uid;
}

export function hasActiveChat() {
  return !!activeChatId && !!activePeerUid;
}

export async function createOrGetChat(otherUid) {
  const uid = currentUid();

  const chatId = generatePairKey(uid, otherUid);
  const friendshipId = generatePairKey(uid, otherUid);

  const friendshipSnap = await getDoc(doc(db, 'friendships', friendshipId));
  if (!friendshipSnap.exists()) {
    throw new Error('Chat nur zwischen Freunden möglich.');
  }

  await setDoc(doc(db, 'chats', chatId), {
    members: [uid, otherUid].sort(),
    lastMessage: '',
    lastMessageAt: null
  }, { merge: true });

  // 🔥 WICHTIG: STATE HIER SETZEN
  activeChatId = chatId;
  activePeerUid = otherUid;

  return chatId;
}

export async function sendMessage(text) {
  const uid = currentUid();
  const cleanText = safeText(text);

  if (!hasActiveChat()) {
    throw new Error('Kein Chat ausgewählt.');
  }

  if (!cleanText) {
    throw new Error('Nachricht leer.');
  }

  const batch = writeBatch(db);

  const messageRef = doc(collection(db, 'chats', activeChatId, 'messages'));

  batch.set(messageRef, {
    text: cleanText,
    senderId: uid,
    timestamp: serverTimestamp()
  });

  batch.set(doc(db, 'chats', activeChatId), {
    members: [uid, activePeerUid].sort(),
    lastMessage: cleanText,
    lastMessageAt: serverTimestamp()
  }, { merge: true });

  await batch.commit();
}

export function listenMessages(chatId, callback) {
  stopListeningMessages();

  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('timestamp', 'asc')
  );

  messagesUnsubscribe = onSnapshot(q, (snap) => {
    const messages = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    callback(messages);
  });
}

export function stopListeningMessages() {
  if (messagesUnsubscribe) {
    messagesUnsubscribe();
    messagesUnsubscribe = null;
  }
}

export function renderMessages(container, messages, currentUid) {
  if (!container) return;

  container.innerHTML = '';

  if (!messages.length) {
    container.innerHTML = `
      <div class="empty-chat">
        <strong>Noch keine Nachrichten</strong>
        <div class="muted">Starte die Konversation 🚀</div>
      </div>
    `;
    return;
  }

  messages.forEach(msg => {
    const row = document.createElement('div');
    row.className = `message-row ${msg.senderId === currentUid ? 'mine' : 'theirs'}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = msg.text;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = formatDate(msg.timestamp);

    bubble.append(text, meta);
    row.appendChild(bubble);
    container.appendChild(row);
  });

  container.scrollTop = container.scrollHeight;
}