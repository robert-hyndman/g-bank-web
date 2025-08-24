<template>
  <v-app class="background-image">
    <router-view />
  </v-app>
</template>

<script setup>
  //
</script>

<style scoped>
.background-image {
    background-image: url('/bank.jpg');
    background-size: cover;
    background-position: top center;
    background-repeat: no-repeat;
    background-attachment: fixed;
    min-height: 100vh;
}
</style>
