import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { AccentColor } from "@booklite/shared";
import { accentPresets } from "@/lib/accent";
import { useAuth } from "@/lib/auth";
import { useState } from "react";

export function AccentPicker({ menu = false }: { menu?: boolean }) {
  const { me, setAccent } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className={menu ? "space-y-2 px-2 py-2" : "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/50 pt-3"}>
      <p className={menu ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>Accent colour</p>
      <div className="flex gap-2" role="group" aria-label="Accent colour">
        {(Object.keys(accentPresets) as AccentColor[]).map((key) => {
          const swatch = (
            <button key={key} type="button" aria-label={key} title={key}
              aria-pressed={(me?.accentColor ?? "orange") === key} disabled={pending}
              className="accent-swatch size-6 shrink-0 rounded-full p-0 disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${accentPresets[key].join(", ")})` }}
              onClick={async () => {
                setPending(true);
                setError("");
                try { await setAccent(key); } catch { setError("Could not save colour. Try again."); }
                finally { setPending(false); }
              }} />
          );
          return menu ? <DropdownMenuItem key={key} asChild disabled={pending} onSelect={(event) => event.preventDefault()}>{swatch}</DropdownMenuItem> : swatch;
        })}
      </div>
      {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
