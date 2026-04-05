import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyDf8dwjNkE9tM-BCwlIbdOPO2LR0kQXOiI",
  authDomain: "archai-1d905.firebaseapp.com",
  projectId: "archai-1d905",
  storageBucket: "archai-1d905.firebasestorage.app",
  messagingSenderId: "794454098937",
  appId: "1:794454098937:web:84a10e4075263aa761b328",
  measurementId: "G-36PMWYL250",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Analytics only works in browser environments with cookies allowed
isSupported().then((yes) => { if (yes) getAnalytics(app); });
