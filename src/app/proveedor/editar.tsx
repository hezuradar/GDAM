import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { announce, announceErrors, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { FormScroll } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { getSupplier, saveSupplier } from '@/api/data';
import { goBack, parseIdParam, safeReturnPath, whatsappDigits } from '@/lib/params';

const MAX_NAME = 80;

export default function SupplierFormScreen() {
  const params = useLocalSearchParams<{ id?: string; returnTo?: string }>();
  const id = parseIdParam(params.id);
  // Set when the supplier is created in the middle of another flow (e.g. a new order).
  // safeReturnPath only allows simple internal routes, so the cast is safe.
  const returnTo = safeReturnPath(params.returnTo) as Href | null;
  const leave = () => (returnTo ? router.replace(returnTo) : goBack());
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [notes, setNotes] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    if (id === null) return;
    getSupplier(id)
      .then((s) => {
        if (!s) {
          showError('Proveedor no encontrado', new Error('Puede que se haya eliminado.'));
          leave();
          return;
        }
        setName(s.name);
        setWhatsapp(s.whatsapp);
        setNotes(s.notes);
      })
      .catch((e: unknown) => showError('No se pudo cargar el proveedor', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    const trimmed = name.trim();
    let invalid = false;
    if (trimmed.length === 0 || trimmed.length > MAX_NAME) {
      const message = `El nombre es obligatorio (máx. ${MAX_NAME} caracteres)`;
      setNameError(message);
      announceErrors({ name: message });
      invalid = true;
    }
    // A number without country code would open a WhatsApp chat with the wrong contact.
    if (whatsapp.trim() !== '' && whatsappDigits(whatsapp) === null) {
      const message = 'Número no válido: usa el prefijo de país, p. ej. +34 600 000 000';
      setWhatsappError(message);
      announceErrors({ whatsapp: message });
      invalid = true;
    }
    if (invalid || isSaving) return;
    setSaving(true);
    try {
      await saveSupplier({ name: trimmed, whatsapp, notes }, id);
      announce('Proveedor guardado');
      leave();
    } catch (e: unknown) {
      showError('No se pudo guardar', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormScroll>
      <Stack.Screen options={{ title: id === null ? 'Nuevo proveedor' : 'Editar proveedor' }} />
      <TextField
        label="Nombre"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setNameError(null);
        }}
        error={nameError}
        autoFocus={id === null}
        maxLength={MAX_NAME}
        autoComplete="organization"
      />
      <TextField
        label="WhatsApp"
        value={whatsapp}
        onChangeText={(v) => {
          setWhatsapp(v);
          if (whatsappError) setWhatsappError(null);
        }}
        error={whatsappError ?? undefined}
        keyboardType="phone-pad"
        autoComplete="tel"
        hint="Con prefijo de país, p. ej. +86 138 0000 0000"
      />
      <TextField label="Notas" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
      <Button label={isSaving ? 'Guardando…' : 'Guardar'} icon="checkmark" onPress={handleSave} isDisabled={isSaving} />
    </FormScroll>
  );
}
