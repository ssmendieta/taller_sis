import { useState, useEffect } from "react";
// Hook ejemplo placeholder
export function usePlaceholder() {
  const [value] = useState("placeholder");
  useEffect(() => {}, []);
  return value;
}
