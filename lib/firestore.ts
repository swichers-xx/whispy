import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  doc, 
  updateDoc, 
  deleteDoc, 
  where, 
  getDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';

// Message types
export interface BaseMessage {
  id?: string;
  type: string;
  sender: string;
  userId: string;
  timestamp: Timestamp | number;
  roomId: string;
}

export interface TextMessage extends BaseMessage {
  type: "text";
  text: string;
  replyTo?: string;
  reactions?: { [emoji: string]: string[] };
  readBy?: string[];
  ratings?: { [raterUserId: string]: number };
  ratingScore?: number;
}

export interface MediaMessage extends BaseMessage {
  type: "media";
  mediaType: "image" | "video" | "audio";
  url: string;
  caption?: string;
  replyTo?: string;
  reactions?: { [emoji: string]: string[] };
  readBy?: string[];
  ratings?: { [raterUserId: string]: number };
  ratingScore?: number;
}

export type Message = TextMessage | MediaMessage;

// Collection references
const messagesCollection = collection(db, 'messages');
const roomsCollection = collection(db, 'rooms');
const usersCollection = collection(db, 'users');

// Room settings interface
export interface RoomSettings {
  id?: string;
  welcomeMessage?: string;
  allowMediaUploads?: boolean;
  allowReactions?: boolean;
  bannedWords?: string[];
  maxMessageHistory?: number;
}

// User interface for Firestore
export interface UserData {
  id: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  lastSeen: Timestamp | number;
  isTyping?: boolean;
  rankingScore?: number;
  rooms?: string[];
}

// Message functions
export const addMessage = async (message: Omit<Message, 'id'>) => {
  const messageWithTimestamp = {
    ...message,
    timestamp: serverTimestamp()
  };
  const docRef = await addDoc(messagesCollection, messageWithTimestamp);
  return { ...messageWithTimestamp, id: docRef.id };
};

export const getMessages = async (roomId: string, messageLimit = 100) => {
  const q = query(
    messagesCollection,
    where('roomId', '==', roomId),
    orderBy('timestamp', 'desc'),
    limit(messageLimit)
  );
  
  const querySnapshot = await getDocs(q);
  const messages: Message[] = [];
  
  querySnapshot.forEach((doc) => {
    const data = doc.data() as Message;
    messages.push({
      ...data,
      id: doc.id
    });
  });
  
  return messages.reverse(); // Return in chronological order
};

export const updateMessage = async (messageId: string, updates: Partial<Message>) => {
  const messageRef = doc(messagesCollection, messageId);
  await updateDoc(messageRef, updates);
};

export const deleteMessage = async (messageId: string) => {
  const messageRef = doc(messagesCollection, messageId);
  await deleteDoc(messageRef);
};

export const addReaction = async (messageId: string, userId: string, reaction: string) => {
  const messageRef = doc(messagesCollection, messageId);
  const messageSnap = await getDoc(messageRef);
  
  if (!messageSnap.exists()) {
    throw new Error('Message not found');
  }
  
  const messageData = messageSnap.data() as Message;
  const reactions = messageData.reactions || {};
  const userReactions = reactions[reaction] || [];
  
  // Toggle reaction
  if (userReactions.includes(userId)) {
    reactions[reaction] = userReactions.filter(id => id !== userId);
    if (reactions[reaction].length === 0) {
      delete reactions[reaction];
    }
  } else {
    reactions[reaction] = [...userReactions, userId];
  }
  
  await updateDoc(messageRef, { reactions });
};

export const rateMessage = async (messageId: string, userId: string, rating: number) => {
  const messageRef = doc(messagesCollection, messageId);
  const messageSnap = await getDoc(messageRef);
  
  if (!messageSnap.exists()) {
    throw new Error('Message not found');
  }
  
  const messageData = messageSnap.data() as Message;
  
  // Prevent self-rating
  if (messageData.userId === userId) {
    throw new Error('Cannot rate your own message');
  }
  
  const ratings = messageData.ratings || {};
  ratings[userId] = rating;
  
  // Calculate rating score
  const ratingScore = Object.values(ratings).reduce((sum, val) => sum + val, 0);
  
  await updateDoc(messageRef, { 
    ratings, 
    ratingScore 
  });
  
  // Update user ranking
  await updateUserRanking(messageData.userId);
};

// Room functions
export const createRoom = async (roomData: Omit<RoomSettings, 'id'>) => {
  const roomWithTimestamp = {
    ...roomData,
    createdAt: serverTimestamp()
  };
  const docRef = await addDoc(roomsCollection, roomWithTimestamp);
  return { ...roomWithTimestamp, id: docRef.id };
};

export const getRoomSettings = async (roomId: string) => {
  const roomRef = doc(roomsCollection, roomId);
  const roomSnap = await getDoc(roomRef);
  
  if (!roomSnap.exists()) {
    throw new Error('Room not found');
  }
  
  return { ...roomSnap.data(), id: roomSnap.id } as RoomSettings;
};

export const updateRoomSettings = async (roomId: string, updates: Partial<RoomSettings>) => {
  const roomRef = doc(roomsCollection, roomId);
  await updateDoc(roomRef, updates);
};

// User functions
export const updateUserData = async (userData: UserData) => {
  const userRef = doc(usersCollection, userData.id);
  const userSnap = await getDoc(userRef);
  
  if (userSnap.exists()) {
    await updateDoc(userRef, {
      ...userData,
      lastSeen: serverTimestamp()
    });
  } else {
    await updateDoc(userRef, {
      ...userData,
      lastSeen: serverTimestamp(),
      rankingScore: 0
    });
  }
};

export const updateUserTypingStatus = async (userId: string, roomId: string, isTyping: boolean) => {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, { 
    isTyping,
    lastSeen: serverTimestamp()
  });
};

export const updateUserRanking = async (userId: string) => {
  // Get all messages by this user
  const q = query(
    messagesCollection,
    where('userId', '==', userId)
  );
  
  const querySnapshot = await getDocs(q);
  let totalScore = 0;
  
  querySnapshot.forEach((doc) => {
    const data = doc.data() as Message;
    totalScore += data.ratingScore || 0;
  });
  
  // Update user's ranking score
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, { rankingScore: totalScore });
  
  return totalScore;
};

export const getActiveUsers = async (roomId: string) => {
  // Consider users active if they've been seen in the last 10 minutes
  const tenMinutesAgo = new Date();
  tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);
  
  const q = query(
    usersCollection,
    where('rooms', 'array-contains', roomId),
    where('lastSeen', '>=', Timestamp.fromDate(tenMinutesAgo))
  );
  
  const querySnapshot = await getDocs(q);
  const users: UserData[] = [];
  
  querySnapshot.forEach((doc) => {
    users.push({ ...doc.data(), id: doc.id } as UserData);
  });
  
  return users;
};
