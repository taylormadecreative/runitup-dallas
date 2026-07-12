import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.runitupdallas.app',
  appName: 'Run It UP!',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scheme: 'Run It UP',
    backgroundColor: '#0A0A0A'
  },
  plugins: {}
};

export default config;
