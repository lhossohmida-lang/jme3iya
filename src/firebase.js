import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyB6CEEQ8kylrkHlprKhg_sYlV3JYVp-Wsw',
  authDomain: 'jam3ya-d93d0.firebaseapp.com',
  projectId: 'jam3ya-d93d0',
  storageBucket: 'jam3ya-d93d0.firebasestorage.app',
  messagingSenderId: '189304407068',
  appId: '1:189304407068:web:82f83d0fa89365a5c60bd9',
  measurementId: 'G-Z15P46B1HT'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export let analytics = null;

if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) analytics = getAnalytics(app);
    })
    .catch(() => {
      analytics = null;
    });
}

export async function uploadFileToStorage(path, file) {
  if (!file) return '';
  const safeName = file.name.replace(/[^\w.\-]+/g, '-');
  const fileRef = ref(storage, `${path}/${Date.now()}-${safeName}`);
  await uploadBytes(fileRef, file, { contentType: file.type });
  return getDownloadURL(fileRef);
}
