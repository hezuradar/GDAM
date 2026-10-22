import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { onUnauthorized } from '@/api/client';
import { getSession, login } from '@/api/data';
import { radius, spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';
import { announce, errorMessage } from './ui/alerts';
import { Button } from './ui/Button';
import { LoadingView } from './ui/Layout';
import { TextField } from './ui/TextField';

type GateState = 'checking' | 'login' | 'ready' | 'notConfigured' | 'offline';
type GateResult = { readonly state: Exclude<GateState, 'checking'>; readonly message: string | null };

/** Asks the server which screen the gate has to show. */
async function resolveGate(): Promise<GateResult> {
  try {
    const session = await getSession();
    return { state: !session.configured ? 'notConfigured' : session.authenticated ? 'ready' : 'login', message: null };
  } catch (e: unknown) {
    return { state: 'offline', message: errorMessage(e) };
  }
}

/** Shows the app only with a valid session; otherwise a password screen. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking');
  const [message, setMessage] = useState<string | null>(null);

  const applyGate = useCallback((result: GateResult) => {
    setMessage(result.message);
    setState(result.state);
  }, []);

  const check = useCallback(() => {
    setState('checking');
    void resolveGate().then(applyGate);
  }, [applyGate]);

  useEffect(() => {
    // The initial state is already 'checking': only the answer has to be awaited.
    void resolveGate().then(applyGate);
    return onUnauthorized(() => setState('login'));
  }, [applyGate]);

  if (state === 'ready') return <>{children}</>;
  if (state === 'checking') return <LoadingView />;
  if (state === 'login') return <LoginScreen onSuccess={() => setState('ready')} />;
  return (
    <InfoScreen
      icon={state === 'offline' ? 'cloud-offline-outline' : 'lock-closed-outline'}
      title={state === 'offline' ? 'Sin conexión' : 'Falta configurar la contraseña'}
      message={
        state === 'offline'
          ? (message ?? 'No se pudo contactar con el servidor.')
          : 'La app todavía no tiene contraseña. Hay que guardarla en el servidor (secreto APP_PASSWORD); los pasos están en el README.'
      }
      onRetry={check}
    />
  );
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setSending] = useState(false);

  const submit = async () => {
    if (!password || isSending) return;
    setSending(true);
    setError(null);
    try {
      await login(password);
      announce('Sesión iniciada');
      onSuccess();
    } catch (e: unknown) {
      const text = errorMessage(e);
      setError(text);
      announce(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Ionicons name="receipt-outline" size={40} color={theme.colors.primary} />
        <Text style={styles.title} accessibilityRole="header">
          Compras a proveedores
        </Text>
        <TextField
          label="Contraseña"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError(null);
          }}
          secureTextEntry
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          error={error}
          onSubmitEditing={submit}
          enterKeyHint="go"
        />
        <View style={styles.action}>
          <Button label={isSending ? 'Entrando…' : 'Entrar'} icon="log-in-outline" onPress={submit} isDisabled={!password || isSending} />
        </View>
      </View>
    </View>
  );
}

type InfoScreenProps = { icon: 'cloud-offline-outline' | 'lock-closed-outline'; title: string; message: string; onRetry: () => void };

function InfoScreen({ icon, title, message, onRetry }: InfoScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.screen} accessibilityRole="alert">
      <View style={styles.card}>
        <Ionicons name={icon} size={40} color={theme.colors.textSecondary} />
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.action}>
          <Button variant="secondary" label="Reintentar" icon="refresh" onPress={onRetry} />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: theme.colors.background },
    card: {
      width: '100%',
      maxWidth: 420,
      gap: spacing.lg,
      padding: spacing.xl,
      borderRadius: radius.lg,
      backgroundColor: theme.colors.surface,
      alignItems: 'stretch',
    },
    title: { ...typography.title, color: theme.colors.text, textAlign: 'center' },
    message: { ...typography.body, color: theme.colors.textSecondary, textAlign: 'center' },
    // Row wrapper: Button grows along the main axis, so in a column it would stretch vertically.
    action: { flexDirection: 'row' },
  });
