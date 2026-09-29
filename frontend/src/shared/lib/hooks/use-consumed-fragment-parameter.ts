import { useLayoutEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

function readFragmentParameter(hash: string, name: string): string | null {
  if (hash.length <= 1) return null;

  try {
    return new URLSearchParams(hash.slice(1)).get(name);
  } catch {
    return null;
  }
}

export function useConsumedFragmentParameter(name: string): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const captureKey = `${name}\u0000${location.hash}`;
  const [previousCaptureKey, setPreviousCaptureKey] = useState(captureKey);
  const [value, setValue] = useState(() => readFragmentParameter(location.hash, name));

  if (captureKey !== previousCaptureKey) {
    setPreviousCaptureKey(captureKey);
    if (location.hash.length > 0) {
      setValue(readFragmentParameter(location.hash, name));
    }
  }

  useLayoutEffect(() => {
    if (location.hash.length === 0) return;

    void navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: "",
      },
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, name, navigate]);

  return value;
}
