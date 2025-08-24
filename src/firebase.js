import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_API_KEY,
    authDomain: "ah-gbank.firebaseapp.com",
    projectId: "ah-gbank",
    storageBucket: "ah-gbank.firebasestorage.app",
    messagingSenderId: "556478380829",
    appId: "1:556478380829:web:25caae02827b4688eb7ff4"
  };

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { db };
    