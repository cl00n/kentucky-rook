import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { login, register, validateToken } from './api';

const COLORS = {
  bg: '#1a0a00',
  gold: '#c8960c',
  goldMuted: '#9a7010',
  goldDim: '#5a4208',
  red: '#cc2222',
  white: '#ffffff',
  textMuted: '#7a5c2a',
  inputBg: '#2a1500',
  border: '#5a4208',
};

export default function LoginScreen({ onLogin }: { onLogin: (user: { username: string; token: string }) => void }) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingToken, setCheckingToken] = useState(true);

  useEffect(() => {
    // Auto-login from saved session
    try {
      const saved = window.localStorage?.getItem('rook_session');
      if (saved) {
        const { username: u, token } = JSON.parse(saved);
        validateToken(token).then((res) => {
          if (res?.ok || res?.valid) {
            onLogin({ username: u, token });
          } else {
            // Token expired but pre-fill credentials if saved
            window.localStorage?.removeItem('rook_session');
            const creds = window.localStorage?.getItem('rook_credentials');
            if (creds) {
              const { username: su, password: sp } = JSON.parse(creds);
              setUsername(su);
              setPassword(sp);
              setRememberMe(true);
            }
            setCheckingToken(false);
          }
        }).catch(() => setCheckingToken(false));
        return;
      }
    } catch {
      // ignore
    }
    // Pre-fill saved credentials even if no session
    try {
      const creds = window.localStorage?.getItem('rook_credentials');
      if (creds) {
        const { username: su, password: sp } = JSON.parse(creds);
        setUsername(su);
        setPassword(sp);
        setRememberMe(true);
      }
    } catch { /* ignore */ }
    setCheckingToken(false);
  }, []);

  async function handleSubmit() {
    if (!username.trim() || !password.trim()) {
      setError('Please enter username and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      let res: any;
      if (tab === 'login') {
        res = await login(username.trim(), password, rememberMe);
        // If account doesn't exist (wiped by server restart), auto-register silently
        if (!res?.token && res?.error === 'Invalid username or password.') {
          const regRes = await register(username.trim(), password);
          if (regRes?.token) res = regRes;
        }
      } else {
        res = await register(username.trim(), password);
      }
      if (res?.token) {
        if (rememberMe) {
          try {
            window.localStorage?.setItem('rook_session', JSON.stringify({ username: username.trim(), token: res.token }));
            window.localStorage?.setItem('rook_credentials', JSON.stringify({ username: username.trim(), password }));
          } catch { /* ignore */ }
        } else {
          try { window.localStorage?.removeItem('rook_credentials'); } catch { /* ignore */ }
        }
        onLogin({ username: username.trim(), token: res.token });
      } else {
        setError(res?.error || res?.message || 'Something went wrong.');
      }
    } catch (e: any) {
      setError(e?.message || 'Network error.');
    } finally {
      setLoading(false);
    }
  }

  if (checkingToken) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>Checking session...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Kentucky Rook</Text>
        <Text style={styles.subtitle}>Kimberley Rules</Text>
      </View>

      <View style={styles.card}>
        {/* Tab toggle */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, tab === 'login' && styles.tabActive]}
            onPress={() => { setTab('login'); setError(''); }}
          >
            <Text style={[styles.tabText, tab === 'login' && styles.tabTextActive]}>LOGIN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'register' && styles.tabActive]}
            onPress={() => { setTab('register'); setError(''); }}
          >
            <Text style={[styles.tabText, tab === 'register' && styles.tabTextActive]}>REGISTER</Text>
          </TouchableOpacity>
        </View>

        {/* Inputs */}
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor={COLORS.textMuted}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={COLORS.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        {/* Remember me */}
        <TouchableOpacity style={styles.checkRow} onPress={() => setRememberMe(v => !v)} activeOpacity={0.7}>
          <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
            {rememberMe && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>Remember me</Text>
        </TouchableOpacity>

        {/* Error */}
        {!!error && <Text style={styles.error}>{error}</Text>}

        {/* Submit */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading} activeOpacity={0.8}>
          {loading
            ? <ActivityIndicator color={COLORS.bg} />
            : <Text style={styles.submitText}>{tab === 'login' ? 'Login' : 'Create Account'}</Text>
          }
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>To 500 Points • Kimberley Rules</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  container: {
    flexGrow: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: COLORS.gold,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(200,150,12,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.goldMuted,
    letterSpacing: 3,
    marginTop: 6,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0d0500',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.goldDim,
    padding: 24,
    gap: 14,
  },
  tabRow: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.goldDim,
    marginBottom: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: COLORS.gold,
  },
  tabText: {
    color: COLORS.goldMuted,
    fontWeight: '700',
    letterSpacing: 1.5,
    fontSize: 13,
  },
  tabTextActive: {
    color: COLORS.bg,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: COLORS.white,
    fontSize: 15,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.inputBg,
  },
  checkboxChecked: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  checkmark: {
    color: COLORS.bg,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  checkLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  error: {
    color: COLORS.red,
    fontSize: 13,
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: COLORS.gold,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  submitText: {
    color: COLORS.bg,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  footer: {
    marginTop: 32,
    color: COLORS.textMuted,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
});
