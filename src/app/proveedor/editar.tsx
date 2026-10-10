import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { announce, announceErrors, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { FormScroll } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { getSupplier, saveSupplier } from '@/db/suppliersRepo';
import { goBack, parseIdParam } from '@/lib/params';

const MAX_NAME = 80;

export default function SupplierFormScreen() {
  const db = useSQLiteContext();
  const id = parseIdParam(useLocalSearchParams<{ id?: string }>().id);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [notes, setNotes] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    if (id === null) return;
    getSupplier(db, id)
      .then((s) => {
        if (!s) {
          showError('Proveedor no encontrado', new Error('Puede que se haya eliminado.'));
          goBack();
          return;
        }
        setName(s.name);
        setWhatsapp(s.whatsapp);
        setNotes(s.notes);
      })
      .catch((e: unknown) => showError('No se pudo cargar el proveedor', e));
  }, [db, id]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME) {
      const message = `El nombre es obligatorio (máx. ${MAX_NAME} caracteres)`;
      setNameError(message);
      announceErrors({ name: message });
      return;
    }
    if (isSaving) return;
    setSaving(true);
    try {
      await saveSupplier(db, { name: trimmed, whatsapp, notes }, id);
      announce('Proveedor guardado');
      goBack();
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
        onChangeText={setWhatsapp}
        keyboardType="phone-pad"
        autoComplete="tel"
        hint="Con prefijo de país, p. ej. +86 138 0000 0000"
      />
      <TextField label="Notas" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
      <Button label={isSaving ? 'Guardando…' : 'Guardar'} icon="checkmark" onPress={handleSave} isDisabled={isSaving} />
    </FormScroll>
  );
}
