import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

// Generate a unique filename with timestamp and random string
const generateUniqueFilename = (originalName: string) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 10);
  const extension = originalName.split('.').pop();
  return `${timestamp}-${randomString}.${extension}`;
};

// Upload a file to Firebase Storage
export const uploadFile = async (file: File, path: string = 'media'): Promise<string> => {
  try {
    // Create a unique filename
    const uniqueFilename = generateUniqueFilename(file.name);
    const fullPath = `${path}/${uniqueFilename}`;
    
    // Create a reference to the file location
    const storageRef = ref(storage, fullPath);
    
    // Upload the file
    const snapshot = await uploadBytes(storageRef, file);
    
    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

// Upload a media file specifically for chat messages
export const uploadMediaForMessage = async (
  file: File, 
  userId: string, 
  roomId: string
): Promise<string> => {
  const path = `rooms/${roomId}/users/${userId}/media`;
  return uploadFile(file, path);
};

// Upload a profile picture
export const uploadProfilePicture = async (
  file: File, 
  userId: string
): Promise<string> => {
  const path = `users/${userId}/profile`;
  return uploadFile(file, path);
};
