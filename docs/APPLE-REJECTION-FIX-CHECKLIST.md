# Apple Rejection Fix — Step-by-Step Checklist

Submission ID: `dd588492-59eb-495c-b821-253dc2834e60`
Guideline: 2.1(a) — Apple & Google login failed on iPhone 17 Pro Max / iOS 26.4

Code fix is complete. Below are the 6 portal steps you must do before re-submitting, in order.

---

## 1. Apple Developer Portal (~2 min)

URL: https://developer.apple.com/account/resources/identifiers/list

1. Click identifier **`com.runitupdallas.app`**
2. Scroll to **Capabilities** → check ☑ **Sign in with Apple**
3. Click **Save** → confirm modify
4. (No services ID / key needed — native iOS flow uses the bundle ID directly)

---

## 2. Supabase — Apple Provider (~1 min)

URL: https://supabase.com/dashboard/project/rouvbfejsyfcmswlsezd/auth/providers

1. Click **Apple**
2. Toggle **Enable Sign in with Apple** → ON
3. **Client IDs (for Sign in with Apple)** field → enter: `com.runitupdallas.app`
4. Leave Secret Key blank (only required for web OAuth — we're using native)
5. **Save**

---

## 3. Google Cloud Console — Create iOS & Web Clients (~5 min)

URL: https://console.cloud.google.com/apis/credentials

### 3a. iOS OAuth client
1. **+ Create Credentials** → **OAuth client ID**
2. Application type: **iOS**
3. Name: `Run It UP iOS`
4. Bundle ID: `com.runitupdallas.app`
5. **Create**
6. Copy the **Client ID** (ends `.apps.googleusercontent.com`) — this is `GOOGLE_IOS_CLIENT_ID`
7. Reverse it for `REVERSED_CLIENT_ID`. Example:
   - `123456-abcdef.apps.googleusercontent.com` → `com.googleusercontent.apps.123456-abcdef`

### 3b. Web OAuth client (if you don't already have one)
1. **+ Create Credentials** → **OAuth client ID**
2. Application type: **Web application**
3. Name: `Run It UP Web`
4. Authorized redirect URIs → add: `https://rouvbfejsyfcmswlsezd.supabase.co/auth/v1/callback`
5. **Create**
6. Copy **Client ID** → this is `GOOGLE_WEB_CLIENT_ID`
7. Copy **Client Secret** (needed in step 5)

---

## 4. Fill In the 3 Placeholders

### `js/supabase.js` (lines ~30-31)
```js
const GOOGLE_IOS_CLIENT_ID = '123456-abcdef.apps.googleusercontent.com';   // from 3a
const GOOGLE_WEB_CLIENT_ID = '789012-xyz.apps.googleusercontent.com';      // from 3b
```

### `ios/App/App/Info.plist` (line ~75)
Replace `REVERSED_CLIENT_ID` with the reversed iOS client ID from 3a:
```xml
<string>com.googleusercontent.apps.123456-abcdef</string>
```

---

## 5. Supabase — Google Provider (~1 min)

Same URL as step 2.

1. Click **Google**
2. Toggle **Enable Sign in with Google** → ON
3. **Client ID (for OAuth)**: paste `GOOGLE_WEB_CLIENT_ID`
4. **Client Secret**: paste the web client secret from 3b
5. **Authorized Client IDs** (comma-separated): paste **both** `GOOGLE_IOS_CLIENT_ID` **and** `GOOGLE_WEB_CLIENT_ID`
6. **Save**

### Redirect URLs (web-fallback)
Supabase → **Authentication → URL Configuration**
- **Redirect URLs** → add: `com.runitupdallas.app://auth/callback`
- **Save**

---

## 6. Rebuild & Archive

```bash
cd ~/Documents/runitup-app
npm run cap:sync
npx cap open ios
```

In Xcode:
1. Select **App** target → **Signing & Capabilities** tab
2. Confirm **Sign in with Apple** capability appears (auto-added from entitlements file)
3. Bump build number: **General → Identity → Build** → `3`
4. **Product → Archive**
5. Upload to App Store Connect
6. Submit new build for review

---

## Test Before Submitting (Critical)

On a real iPhone (not simulator):
- ☐ Continue with Apple → native sheet appears → signs in → lands on home/onboarding
- ☐ Continue with Google → native sheet appears → signs in → lands on home/onboarding
- ☐ Email/password signup still works
- ☐ Log out and log back in with each method

If Apple sheet doesn't appear: entitlements file not linked → open Xcode → Signing & Capabilities → + Capability → Sign in with Apple.

If Google throws "client not found": Info.plist reversed client ID is wrong, or Google Cloud iOS client bundle ID doesn't match `com.runitupdallas.app`.
