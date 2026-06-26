# mobile-app

uni-app (Vue 3 + Vite) for cigar-collection field staff. Ships as H5, iOS app, and Android app from one codebase.

## What it is
- Field-staff app: log in, browse customers, capture cigar visits, review history, edit profile.
- Stack: uni-app, Vue 3.4, Pinia 2, axios, Sass.
- H5 build → static hosting. APP build → native APK/IPA via HBuilderX or uni-app CLI cloud build.

## Status
T1 scaffold only — 5 pages (login/customers/collect/history/profile) + tabBar. No API calls yet. See `/home/wewe/.omo/plans/cigar-collection.md`.

## Scripts
| Command                  | What it does                                |
| ------------------------ | ------------------------------------------- |
| `npm run dev:h5`         | H5 dev server (default port 5173)           |
| `npm run dev:app`        | APP dev (opens in HBuilderX)                |
| `npm run build:h5`       | H5 production build → `dist/build/h5`       |
| `npm run build:app`      | APP production build (CLI w/ app platform)  |
| `npm run type-check`     | `vue-tsc --noEmit`                          |

## Layout (planned)
```
src/
  main.ts           # createSSRApp + pinia
  App.vue           # onLaunch / onShow / onHide
  manifest.json     # appid, permissions, ios privacy
  pages.json        # routes + tabBar
  pages/
    login/          # 登录
    customers/      # 客户列表 (tabBar)
    collect/        # 采集页
    history/        # 历史 (tabBar)
    profile/        # 我的 (tabBar)
  static/           # static assets
```

## Open platform / build notes
- `appid` in `manifest.json` is a placeholder `__UNI__CIGAR01` — replace when you register a real DCloud account.
- Android permissions: INTERNET, ACCESS_NETWORK_STATE, ACCESS_FINE_LOCATION, CAMERA, READ/WRITE_EXTERNAL_STORAGE.
- iOS privacy strings: NSLocationWhenInUseUsageDescription, NSCameraUsageDescription, NSPhotoLibraryUsageDescription.
- For WeChat MP / Alipay / etc — out of scope, MP packages intentionally excluded.
