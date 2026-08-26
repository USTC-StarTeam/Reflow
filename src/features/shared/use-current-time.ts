import { useEffect, useState } from 'react';

export function useCurrentTime(refreshMilliseconds = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), refreshMilliseconds);
    return () => clearInterval(timer);
  }, [refreshMilliseconds]);

  return now;
}
