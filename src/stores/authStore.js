import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import bcrypt from 'bcryptjs';

export const authStore = defineStore('authStore', () => {
  const isLoggedIn = ref(false);
  const username = ref('');

  const canUpload = computed(() => isLoggedIn.value);

  const initAuth = () => {
    const storedUser = localStorage.getItem('authUser');
    if (storedUser) {
      username.value = storedUser;
      isLoggedIn.value = true;
    }
  };

  const login = async (enteredUsername, enteredPassword) => {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
  
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
  
      const usernameMatch = await bcrypt.compare(enteredUsername, data.username);
      if (usernameMatch) {
        const passwordMatch = await bcrypt.compare(enteredPassword, data.password);
        if (!passwordMatch) {
          throw new Error('Incorrect password.');
        }
  
        username.value = enteredUsername;
        isLoggedIn.value = true;

        localStorage.setItem('authUser', enteredUsername);
  
        return;
      }
    }
  
    throw new Error('User not found.');
  };
  
  const logout = () => {
    username.value = '';
    isLoggedIn.value = false;
    localStorage.removeItem('authUser');
  };
  
  return {
    initAuth,
    isLoggedIn,
    username,
    canUpload,
    login,
    logout,
  };
});
