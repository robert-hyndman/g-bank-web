<template>
  <v-app-bar app elevation="2" height="52">
    <v-app-bar-title class="friz-quadrata ah-gold">
      <div class="d-flex justify-start align-center">
        <v-img src="/logo.png" class="logo"></v-img>
        <div class="ml-2">Almost Heroes Guild Bank</div>
      </div>
    </v-app-bar-title>
    <template v-slot:append>
      <v-col class="d-flex justify-end" v-if="!auth.isLoggedIn">
        <v-btn variant="plain" rounded="0" prepend-icon="mdi-login" @click="openLoginDialog">Login</v-btn>
      </v-col>

      <v-col class="d-flex justify-end align-center" v-else>
        <div class="text-body text-disabled mr-4">Logged in as {{ auth.username }}</div>
        <v-btn variant="plain" rounded="0" prepend-icon="mdi-logout" @click="auth.logout">Log out</v-btn>
      </v-col>
    </template>
  </v-app-bar>

  <!-- Login Dialog -->
  <v-dialog v-model="dialog" max-width="400px">
    <v-card class="wow-tooltip-solid">
      <v-card-title>Login</v-card-title>
      <v-card-text>
        <v-text-field v-model="loginForm.username" label="Username" />
        <v-text-field v-model="loginForm.password" label="Password" type="password" />
      </v-card-text>
      <v-card-actions>
        <v-btn @click="login">Login</v-btn>
        <v-btn @click="dialog = false">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref } from 'vue';
import { authStore } from '@/stores/authStore';
const auth = authStore();

// User login and state management
const dialog = ref(false);

const loginForm = ref({
  username: '',
  password: '',
});

onMounted(async () => {
  auth.initAuth();
});

const openLoginDialog = () => {
  dialog.value = true;
};

const login = async () => {
  try {
    if (loginForm.value.username && loginForm.value.password) {
      await auth.login(loginForm.value.username, loginForm.value.password);
    }
  } catch (error) {
    console.warn("Login error:", error);
  } finally {
    dialog.value = false
    loginForm.value = { username: '', password: '' };
  }
}
</script>

<style scoped>
.v-app-bar {
  background-color: #0070dd;
  color: white;
}

.v-btn {
  color: white;
}

.logo {
  max-width: 32px;
  border-radius: 50%;
}

</style>
