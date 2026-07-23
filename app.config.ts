import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Reflow',
  slug: 'reflow',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'reflow',
  userInterfaceStyle: 'light',
  icon: './assets/images/icon.png',
  web: {
    output: 'static',
    bundler: 'metro',
    favicon: './assets/images/favicon.png',
  },
  plugins: ['expo-router'],
  experiments: {
    typedRoutes: true,
    baseUrl: process.env.GITHUB_PAGES === 'true' ? '/Reflow' : undefined,
  },
});
