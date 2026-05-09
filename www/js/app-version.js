// PLACEHOLDER cho local dev — file này SẼ BỊ GHI ĐÈ bởi GitHub Actions khi build APK.
// Workflow `.github/workflows/build-apk.yml` tự động sinh content mới với:
//   - version: "b{commitCount}.{sha7}"
//   - tag, sha, buildDate, commitMsg
//
// Local dev: window.QLT_BUILD.version = 'dev' → update check sẽ skip.
window.QLT_BUILD = {
  version: 'dev',
  tag: 'dev',
  commitCount: 0,
  sha: 'local',
  buildDate: new Date().toISOString(),
  commitMsg: 'Local development build'
};
