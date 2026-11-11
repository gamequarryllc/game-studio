// app.json holds the app's settings. This file adds what a particular build
// decides for itself:
//
//   APP_BASE_URL       the sub-folder the web preview is served from on the studio site
//                      (APP_BASE_URL=/game-studio/apps/plainlimit npx expo export --platform web)
//   APP_VERSION        the version shown in TestFlight and on the App Store (default: app.json's)
//   APP_BUILD_NUMBER   the build number, which must go up with every upload (default: 1)
//
// The iPhone build (tools/ios_app_build.sh at the top of the repo) sets the last two.
module.exports = ({ config }) => {
  const out = { ...config };
  const baseUrl = process.env.APP_BASE_URL;
  if (baseUrl) out.experiments = { ...config.experiments, baseUrl };
  const version = process.env.APP_VERSION;
  if (version && /^\d+(\.\d+){0,2}$/.test(version)) out.version = version;
  const build = process.env.APP_BUILD_NUMBER;
  if (build && /^\d+$/.test(build)) out.ios = { ...config.ios, buildNumber: build };
  return out;
};
