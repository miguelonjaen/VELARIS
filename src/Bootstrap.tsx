
import React, { useEffect, useState } from 'react';
import App from './App';
import { SplashScreen } from './shared/components/SplashScreen';

export default function Bootstrap() {
  const [showSplash, setShowSplash] = useState(true);
  const [status, setStatus] = useState('Initializing Navigation Core...');

  useEffect(() => {
    const sequence = [
      { text: 'Initializing Navigation Core...', delay: 1200 },
      { text: 'Loading SmartCharts Engine...', delay: 1200 },
      { text: 'Starting AIS Engine...', delay: 1200 },
      { text: 'Loading User Profile...', delay: 1200 },
      { text: 'Ready.', delay: 1200 }
    ];

    let index = 0;
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const run = () => {
      if (cancelled) return;

      if (index >= sequence.length) {
        timeoutId = setTimeout(() => {
          if (!cancelled) setShowSplash(false);
        }, 400);
        return;
      }

      const step = sequence[index];
      setStatus(step.text);

      timeoutId = setTimeout(() => {
        index++;
        run();
      }, step.delay);
    };

    run();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  if (showSplash) {
    return (
      <SplashScreen
        status={status}
        version={__APP_VERSION__}
      />
    );
  }

  return <App />;
}
