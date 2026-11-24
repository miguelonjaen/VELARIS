import { useEffect, useRef, useState } from 'react';

export interface AISConnectionState {
  streamEnabled: boolean;
  streamStatus:
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'missing-key'
    | 'error';
  nmeaEnabled: boolean;
}

interface AISCredentialState extends AISConnectionState {
  credentialConfigured: boolean;
  encryptionAvailable: boolean;
}

export interface AISConnectionControls {
  state: AISConnectionState | null;
  busy: boolean;
  error: string | null;
  credentialConfigured: boolean;
  encryptionAvailable: boolean;
  toggle: (source: 'stream' | 'nmea') => Promise<void>;
  importCredential: () => Promise<void>;
  removeCredential: () => Promise<void>;
}

interface AISConnectionApi {
  getAISConnections(): Promise<AISConnectionState>;
  setAISConnection(
    source: 'stream' | 'nmea',
    enabled: boolean
  ): Promise<AISConnectionState>;
  onAISConnectionStatus(
    callback: (state: AISConnectionState) => void
  ): () => void;
  getAISCredentialStatus(): Promise<AISCredentialState>;
  importAISCredential(): Promise<AISCredentialState>;
  removeAISCredential(): Promise<AISCredentialState>;
}

export function useAISConnections(): AISConnectionControls {
  const [state, setState] = useState<AISConnectionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentialConfigured, setCredentialConfigured] = useState(false);
  const [encryptionAvailable, setEncryptionAvailable] = useState(false);
  const busyRef = useRef(false);

  const api = window.GAULOSAPI as AISConnectionApi | undefined;

  useEffect(() => {
    if (!api?.getAISConnections || !api.onAISConnectionStatus) return;

    let active = true;
    let received = false;

    const off = api.onAISConnectionStatus(value => {
      received = true;
      if (active) setState(value);
    });

    void api.getAISConnections()
      .then(value => {
        if (active && !received) setState(value);
      })
      .catch(() => {
        if (active) setError('No se pudo consultar la conexion AIS.');
      });

    if (api.getAISCredentialStatus) {
      void api.getAISCredentialStatus()
        .then(value => {
          if (!active) return;
          setCredentialConfigured(value.credentialConfigured);
          setEncryptionAvailable(value.encryptionAvailable);
        })
        .catch(() => {
          if (active) setError('No se pudo consultar la credencial AIS.');
        });
    }

    return () => {
      active = false;
      off();
    };
  }, [api]);

  const toggle = async (
    source: 'stream' | 'nmea'
  ): Promise<void> => {
    if (!api || !state || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError(null);

    try {
      setState(await api.setAISConnection(
        source,
        !(source === 'stream'
          ? state.streamEnabled
          : state.nmeaEnabled)
      ));
    } catch {
      setError('No se pudo cambiar la conexion AIS.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const changeCredential = async (
    action: 'import' | 'remove'
  ): Promise<void> => {
    if (!api || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const result = action === 'import'
        ? await api.importAISCredential()
        : await api.removeAISCredential();

      setCredentialConfigured(result.credentialConfigured);
      setEncryptionAvailable(result.encryptionAvailable);
      setState(await api.getAISConnections());
    } catch {
      setError(
        action === 'import'
          ? 'No se pudo importar la credencial. Compruebe el archivo y el cifrado del sistema.'
          : 'No se pudo eliminar la credencial AIS.'
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return {
    state,
    busy,
    error,
    credentialConfigured,
    encryptionAvailable,
    toggle,
    importCredential: () => changeCredential('import'),
    removeCredential: () => changeCredential('remove'),
  };
}