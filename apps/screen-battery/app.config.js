// app.json holds the app's settings. This file only adds the web base path
// when the preview is built for the studio site, where the app lives in a
// sub-folder: APP_BASE_URL=/game-studio/apps/screen-battery npx expo export --platform web
module.exports = ({ config }) => {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
