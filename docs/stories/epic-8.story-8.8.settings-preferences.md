# Epic 8 Story 8.8: Settings & Preferences

## Status
Draft

## Priority
Medium (Core feature - enables app configuration)

## Story
**As a** user,
**I want** to configure my server connections and app preferences,
**so that** I can customize the app to my setup and preferences.

## Acceptance Criteria

1. Settings Screen navigation:
   - Accessible from main tab bar or header menu
   - Organized into logical sections
   - Clear visual hierarchy

2. Navidrome Connection settings:
   - Server URL input with validation
   - Username/password inputs
   - Test Connection button with feedback
   - Connection status indicator
   - Option to disconnect/logout
   - Multi-server support (stretch goal)

3. Lidarr Connection settings (ties to Story 8.7):
   - Server URL input
   - API key input (obscured)
   - Test connection
   - Quality profile selection
   - Enable/disable toggle

4. Audio Settings:
   - Streaming quality selector (Low/Medium/High/Lossless)
   - Download quality selector
   - Crossfade duration (0-12 seconds)
   - Gapless playback toggle
   - Normalize volume toggle

5. Appearance Settings:
   - Theme selector (Light/Dark/System)
   - Persist theme preference

6. Cache Management:
   - Display cache size (artwork, audio)
   - Clear artwork cache button
   - Clear audio cache button
   - Clear all cache button
   - Confirmation dialogs

7. About Section:
   - App version
   - Build number
   - Server versions (Navidrome, Lidarr)
   - Links: GitHub, Support, Privacy Policy
   - Open source licenses

## Tasks / Subtasks

### Settings Navigation (AC: 1)
- [ ] Add Settings tab or header icon
- [ ] Create `app/(main)/settings/index.tsx`
- [ ] Create settings section layout component
- [ ] Implement scroll view with sections

### Navidrome Settings (AC: 2)
- [ ] Create `components/settings/NavidromeSettings.tsx`:
  ```typescript
  export function NavidromeSettings() {
    const { config, updateConfig, testConnection, disconnect } = useNavidromeConfig();
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

    const handleTest = async () => {
      setTesting(true);
      try {
        await testConnection();
        setTestResult('success');
      } catch {
        setTestResult('error');
      } finally {
        setTesting(false);
      }
    };

    return (
      <SettingsSection title="Navidrome Server">
        <TextInput
          label="Server URL"
          value={config.serverUrl}
          onChangeText={(url) => updateConfig({ serverUrl: url })}
          placeholder="https://music.example.com"
          autoCapitalize="none"
          keyboardType="url"
        />
        <TextInput
          label="Username"
          value={config.username}
          onChangeText={(u) => updateConfig({ username: u })}
          autoCapitalize="none"
        />
        <TextInput
          label="Password"
          value={config.password}
          onChangeText={(p) => updateConfig({ password: p })}
          secureTextEntry
        />
        <Button
          title={testing ? 'Testing...' : 'Test Connection'}
          onPress={handleTest}
          disabled={testing}
        />
        {testResult === 'success' && <StatusBadge type="success" text="Connected" />}
        {testResult === 'error' && <StatusBadge type="error" text="Connection Failed" />}
        <Button title="Disconnect" onPress={disconnect} variant="danger" />
      </SettingsSection>
    );
  }
  ```
- [ ] Create `lib/hooks/useNavidromeConfig.ts`
- [ ] Implement secure storage for credentials
- [ ] Test connection validation

### Lidarr Settings (AC: 3)
- [ ] Create `components/settings/LidarrSettings.tsx`:
  ```typescript
  export function LidarrSettings() {
    const {
      config,
      updateConfig,
      testConnection,
      qualityProfiles,
      enabled,
      setEnabled
    } = useLidarrConfig();

    return (
      <SettingsSection title="Lidarr">
        <ToggleRow
          label="Enable Lidarr"
          value={enabled}
          onValueChange={setEnabled}
        />
        {enabled && (
          <>
            <TextInput
              label="Server URL"
              value={config.serverUrl}
              onChangeText={(url) => updateConfig({ serverUrl: url })}
              placeholder="http://localhost:8686"
            />
            <TextInput
              label="API Key"
              value={config.apiKey}
              onChangeText={(key) => updateConfig({ apiKey: key })}
              secureTextEntry
            />
            <Picker
              label="Quality Profile"
              selectedValue={config.qualityProfileId}
              onValueChange={(id) => updateConfig({ qualityProfileId: id })}
              items={qualityProfiles.map(p => ({ label: p.name, value: p.id }))}
            />
            <Button title="Test Connection" onPress={testConnection} />
          </>
        )}
      </SettingsSection>
    );
  }
  ```
- [ ] Create `lib/hooks/useLidarrConfig.ts`
- [ ] Fetch quality profiles on enable
- [ ] Persist enable state

### Audio Settings (AC: 4)
- [ ] Create `components/settings/AudioSettings.tsx`:
  ```typescript
  const QUALITY_OPTIONS = [
    { label: 'Low (128kbps)', value: '128' },
    { label: 'Medium (256kbps)', value: '256' },
    { label: 'High (320kbps)', value: '320' },
    { label: 'Lossless', value: '0' }, // 0 = original
  ];

  export function AudioSettings() {
    const { settings, updateSetting } = useAudioSettings();

    return (
      <SettingsSection title="Audio">
        <Picker
          label="Streaming Quality"
          selectedValue={settings.streamingQuality}
          onValueChange={(v) => updateSetting('streamingQuality', v)}
          items={QUALITY_OPTIONS}
        />
        <Picker
          label="Download Quality"
          selectedValue={settings.downloadQuality}
          onValueChange={(v) => updateSetting('downloadQuality', v)}
          items={QUALITY_OPTIONS}
        />
        <SliderRow
          label="Crossfade"
          value={settings.crossfadeDuration}
          onValueChange={(v) => updateSetting('crossfadeDuration', v)}
          minimumValue={0}
          maximumValue={12}
          step={1}
          suffix="s"
        />
        <ToggleRow
          label="Gapless Playback"
          value={settings.gaplessPlayback}
          onValueChange={(v) => updateSetting('gaplessPlayback', v)}
        />
        <ToggleRow
          label="Normalize Volume"
          value={settings.normalizeVolume}
          onValueChange={(v) => updateSetting('normalizeVolume', v)}
        />
      </SettingsSection>
    );
  }
  ```
- [ ] Create `lib/hooks/useAudioSettings.ts`
- [ ] Apply streaming quality to track URLs (`&maxBitRate=320`)
- [ ] Implement crossfade in TrackPlayer (if supported)

### Appearance Settings (AC: 5)
- [ ] Create `components/settings/AppearanceSettings.tsx`:
  ```typescript
  const THEME_OPTIONS = [
    { label: 'System', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
  ];

  export function AppearanceSettings() {
    const { colorScheme, setColorScheme } = useColorScheme();

    return (
      <SettingsSection title="Appearance">
        <Picker
          label="Theme"
          selectedValue={colorScheme}
          onValueChange={setColorScheme}
          items={THEME_OPTIONS}
        />
      </SettingsSection>
    );
  }
  ```
- [ ] Use `useColorScheme` from NativeWind or custom hook
- [ ] Persist preference to AsyncStorage
- [ ] Apply theme to entire app

### Cache Management (AC: 6)
- [ ] Create `components/settings/CacheSettings.tsx`:
  ```typescript
  export function CacheSettings() {
    const { cacheInfo, clearArtwork, clearAudio, clearAll, refreshCacheInfo } = useCacheManager();
    const [clearing, setClearing] = useState<string | null>(null);

    const handleClear = async (type: 'artwork' | 'audio' | 'all') => {
      const confirmed = await Alert.alert(
        'Clear Cache',
        `Are you sure you want to clear ${type === 'all' ? 'all caches' : `${type} cache`}?`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive' }]
      );
      if (!confirmed) return;

      setClearing(type);
      try {
        if (type === 'artwork') await clearArtwork();
        else if (type === 'audio') await clearAudio();
        else await clearAll();
        await refreshCacheInfo();
      } finally {
        setClearing(null);
      }
    };

    return (
      <SettingsSection title="Storage & Cache">
        <InfoRow label="Artwork Cache" value={formatBytes(cacheInfo.artworkSize)} />
        <InfoRow label="Audio Cache" value={formatBytes(cacheInfo.audioSize)} />
        <InfoRow label="Total" value={formatBytes(cacheInfo.totalSize)} />

        <Button
          title="Clear Artwork Cache"
          onPress={() => handleClear('artwork')}
          loading={clearing === 'artwork'}
        />
        <Button
          title="Clear Audio Cache"
          onPress={() => handleClear('audio')}
          loading={clearing === 'audio'}
        />
        <Button
          title="Clear All Caches"
          onPress={() => handleClear('all')}
          loading={clearing === 'all'}
          variant="danger"
        />
      </SettingsSection>
    );
  }
  ```
- [ ] Create `lib/hooks/useCacheManager.ts`
- [ ] Implement cache size calculation
- [ ] Implement cache clearing functions

### About Section (AC: 7)
- [ ] Create `components/settings/AboutSection.tsx`:
  ```typescript
  import Constants from 'expo-constants';

  export function AboutSection() {
    const { navidromeVersion } = useNavidromeStatus();
    const { lidarrVersion } = useLidarrStatus();

    return (
      <SettingsSection title="About">
        <InfoRow label="Version" value={Constants.expoConfig?.version ?? '1.0.0'} />
        <InfoRow label="Build" value={Constants.expoConfig?.ios?.buildNumber ?? '1'} />
        <InfoRow label="Navidrome" value={navidromeVersion ?? 'Not connected'} />
        <InfoRow label="Lidarr" value={lidarrVersion ?? 'Not configured'} />

        <LinkRow label="GitHub" url="https://github.com/user/aidj-mobile" />
        <LinkRow label="Support" url="https://github.com/user/aidj-mobile/issues" />
        <LinkRow label="Privacy Policy" url="https://example.com/privacy" />
        <LinkRow label="Open Source Licenses" onPress={showLicenses} />
      </SettingsSection>
    );
  }
  ```
- [ ] Get version from app.json/Constants
- [ ] Fetch server versions via API
- [ ] Create licenses screen or modal

### Reusable Settings Components
- [ ] Create `components/settings/SettingsSection.tsx`:
  ```typescript
  interface SettingsSectionProps {
    title: string;
    children: React.ReactNode;
  }

  export function SettingsSection({ title, children }: SettingsSectionProps) {
    return (
      <View className="mb-6">
        <Text className="text-gray-400 text-sm uppercase tracking-wide mb-2 px-4">
          {title}
        </Text>
        <View className="bg-gray-800 rounded-xl overflow-hidden">
          {children}
        </View>
      </View>
    );
  }
  ```
- [ ] Create `components/settings/ToggleRow.tsx`
- [ ] Create `components/settings/SliderRow.tsx`
- [ ] Create `components/settings/InfoRow.tsx`
- [ ] Create `components/settings/LinkRow.tsx`
- [ ] Create `components/settings/Picker.tsx`

## Dev Notes

### Secure Storage Pattern

```typescript
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  NAVIDROME_URL: 'navidrome_url',
  NAVIDROME_USERNAME: 'navidrome_username',
  NAVIDROME_PASSWORD: 'navidrome_password',
  LIDARR_URL: 'lidarr_url',
  LIDARR_API_KEY: 'lidarr_api_key',
};

export async function saveNavidromeConfig(config: NavidromeConfig) {
  await SecureStore.setItemAsync(KEYS.NAVIDROME_URL, config.serverUrl);
  await SecureStore.setItemAsync(KEYS.NAVIDROME_USERNAME, config.username);
  await SecureStore.setItemAsync(KEYS.NAVIDROME_PASSWORD, config.password);
}

export async function getNavidromeConfig(): Promise<NavidromeConfig | null> {
  const serverUrl = await SecureStore.getItemAsync(KEYS.NAVIDROME_URL);
  const username = await SecureStore.getItemAsync(KEYS.NAVIDROME_USERNAME);
  const password = await SecureStore.getItemAsync(KEYS.NAVIDROME_PASSWORD);

  if (!serverUrl || !username || !password) return null;
  return { serverUrl, username, password };
}

export async function clearNavidromeConfig() {
  await SecureStore.deleteItemAsync(KEYS.NAVIDROME_URL);
  await SecureStore.deleteItemAsync(KEYS.NAVIDROME_USERNAME);
  await SecureStore.deleteItemAsync(KEYS.NAVIDROME_PASSWORD);
}
```

### Non-Secure Settings (AsyncStorage)

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'app_settings';

interface AppSettings {
  streamingQuality: '128' | '256' | '320' | '0';
  downloadQuality: '128' | '256' | '320' | '0';
  crossfadeDuration: number;
  gaplessPlayback: boolean;
  normalizeVolume: boolean;
  theme: 'system' | 'light' | 'dark';
  lidarrEnabled: boolean;
  lidarrQualityProfileId: number | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  streamingQuality: '320',
  downloadQuality: '320',
  crossfadeDuration: 0,
  gaplessPlayback: true,
  normalizeVolume: false,
  theme: 'system',
  lidarrEnabled: false,
  lidarrQualityProfileId: null,
};

export async function loadSettings(): Promise<AppSettings> {
  const stored = await AsyncStorage.getItem(SETTINGS_KEY);
  return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
```

### Cache Size Calculation

```typescript
import * as FileSystem from 'expo-file-system';

export async function getCacheInfo() {
  const cacheDir = FileSystem.cacheDirectory;

  // Get directory sizes
  const artworkDir = `${cacheDir}artwork/`;
  const audioDir = `${cacheDir}audio/`;

  const artworkSize = await getDirectorySize(artworkDir);
  const audioSize = await getDirectorySize(audioDir);

  return {
    artworkSize,
    audioSize,
    totalSize: artworkSize + audioSize,
  };
}

async function getDirectorySize(path: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || !info.isDirectory) return 0;

    const files = await FileSystem.readDirectoryAsync(path);
    let size = 0;

    for (const file of files) {
      const fileInfo = await FileSystem.getInfoAsync(`${path}${file}`);
      if (fileInfo.exists && !fileInfo.isDirectory) {
        size += fileInfo.size ?? 0;
      }
    }

    return size;
  } catch {
    return 0;
  }
}

export async function clearCache(type: 'artwork' | 'audio' | 'all') {
  const cacheDir = FileSystem.cacheDirectory;

  if (type === 'artwork' || type === 'all') {
    await FileSystem.deleteAsync(`${cacheDir}artwork/`, { idempotent: true });
  }
  if (type === 'audio' || type === 'all') {
    await FileSystem.deleteAsync(`${cacheDir}audio/`, { idempotent: true });
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
```

### Theme Provider Setup

```typescript
// lib/providers/ThemeProvider.tsx
import { useColorScheme as useNativeColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  colorScheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useNativeColorScheme() ?? 'dark';
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem('theme_preference').then((stored) => {
      if (stored) setPreferenceState(stored as ThemePreference);
    });
  }, []);

  const setPreference = async (pref: ThemePreference) => {
    setPreferenceState(pref);
    await AsyncStorage.setItem('theme_preference', pref);
  };

  const colorScheme = preference === 'system' ? systemScheme : preference;

  return (
    <ThemeContext.Provider value={{ preference, setPreference, colorScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
```

### Streaming Quality URL Parameter

When requesting streams with quality settings:
```typescript
function getStreamUrl(trackId: string, quality: string): string {
  const { serverUrl, authParams } = useNavidromeAuth();

  // quality '0' means original/lossless (no transcoding)
  const maxBitRate = quality === '0' ? '' : `&maxBitRate=${quality}`;

  return `${serverUrl}/rest/stream.view?id=${trackId}${authParams}${maxBitRate}`;
}
```

### File Structure

```
app/(main)/
└── settings/
    ├── index.tsx           # Main settings screen
    └── licenses.tsx        # Open source licenses

components/settings/
├── NavidromeSettings.tsx
├── LidarrSettings.tsx
├── AudioSettings.tsx
├── AppearanceSettings.tsx
├── CacheSettings.tsx
├── AboutSection.tsx
├── SettingsSection.tsx
├── ToggleRow.tsx
├── SliderRow.tsx
├── InfoRow.tsx
├── LinkRow.tsx
└── Picker.tsx

lib/
├── hooks/
│   ├── useNavidromeConfig.ts
│   ├── useLidarrConfig.ts
│   ├── useAudioSettings.ts
│   └── useCacheManager.ts
├── services/
│   ├── secure-storage.ts    # SecureStore wrapper
│   └── settings-storage.ts  # AsyncStorage wrapper
└── providers/
    └── ThemeProvider.tsx
```

## Testing

### Test Cases

1. **Navidrome Connection**
   - Valid credentials connect successfully
   - Invalid credentials show error
   - Disconnect clears credentials
   - Credentials persist across app restart

2. **Lidarr Connection**
   - Enable/disable toggle works
   - Connection test validates setup
   - Quality profiles load correctly

3. **Audio Settings**
   - Quality changes apply to streams
   - Settings persist
   - Crossfade slider works

4. **Theme**
   - Theme changes apply immediately
   - Preference persists
   - System follows device setting

5. **Cache**
   - Shows accurate cache sizes
   - Clear functions work
   - Confirmation dialogs appear

## Definition of Done

- [ ] Settings screen accessible from navigation
- [ ] Navidrome connection configurable
- [ ] Lidarr connection configurable (optional)
- [ ] Audio quality settings work
- [ ] Theme preference persists
- [ ] Cache size displayed and clearable
- [ ] About section shows versions
- [ ] All credentials stored securely
- [ ] Settings persist across app restart

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-12-10 | 1.0 | Initial story draft | SM Agent |
