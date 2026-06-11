import { useEffect, useState } from 'react';
import { AISTarget } from '../types/ais';

export function useAIS() {
  const [targets, setTargets] = useState<AISTarget[]>([]);

  useEffect(() => {
    console.log('AIS Hook initialized');
  }, []);

  return {
    targets,
    setTargets,
  };
}