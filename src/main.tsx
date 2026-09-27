import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { NovaProvider } from "./os/wm";
import { Boot } from "./os/Boot";
import { Desktop } from "./os/Desktop";
import { nova } from "./core/nova";
import type { NovaUser } from "./os/types";

function Root() {
  const [user, setUser] = useState<NovaUser | null>(null);

  // restore the saved machine before the first frame so the desktop is populated
  if (user === null && !nova().restored) {
    nova().restored = true;
    nova().restore();
  }

  return (
    <NovaProvider>
      {user ? <Desktop user={user} /> : <Boot onDesktop={setUser} />}
    </NovaProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
