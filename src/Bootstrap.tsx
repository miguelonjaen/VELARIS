import React, { useEffect, useState } from 'react';
import App from './App';
import { SplashScreen } from './shared/components/SplashScreen';

export default function Bootstrap() {
  const [showSplash, setShowSplash] = useState(true);
  const [status, setStatus] = useState("Initializing Navigation Core...");

  useEffect(() => {
    const sequence = [
      { text: "Initializing Navigation Core...", delay: 1200 },
      { text: "Loading SmartCharts Engine...", delay: 1200 },
      { text: "Starting AIS Engine...", delay: 1200 },
      { text: "Loading User Profile...", delay: 1200 },
      { text: "Ready.", delay: 1200 }
    ];

    let index = 0;

    const run = () => {
      if (index >= sequence.length) {
        setTimeout(() => {
          setShowSplash(false);
        }, 400);

        return;
      }

      setStatus(sequence[index].text);

      setTimeout(() => {
        index++;
        run();
      }, sequence[index].delay);
    };

    run();
  }, []);

  if (showSplash) {
    return (
      <SplashScreen
        status={status}
        version="1.1.4"
      />
    );
  }

  return <App />;
}