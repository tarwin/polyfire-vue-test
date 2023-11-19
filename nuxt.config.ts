// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  plugins: ['~/plugins/polaris.client.ts'],
  build: {
    transpile: ["@ownego/polaris-vue"],
  },
})
