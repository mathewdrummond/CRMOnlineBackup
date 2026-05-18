import React, { useState } from "react";
import { Delete, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const ROWS_LOWER = [
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["z","x","c","v","b","n","m"],
];
const ROWS_UPPER = ROWS_LOWER.map(row => row.map(k => k.toUpperCase()));
const NUMBERS = [["1","2","3","4","5","6","7","8","9","0"],["-","_","(",")","@","#","$","&","!","?"]];

export default function OnScreenKeyboard({ value, onChange, onClose }) {
  const [caps, setCaps] = useState(false);
  const [numMode, setNumMode] = useState(false);

  const press = (key) => onChange(value + key);
  const backspace = () => onChange(value.slice(0, -1));
  const space = () => onChange(value + " ");

  const rows = numMode ? NUMBERS : (caps ? ROWS_UPPER : ROWS_LOWER);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-2xl p-3 space-y-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm text-muted-foreground font-medium">Keyboard</span>
        <button
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
        >
          Done
        </button>
      </div>

      {rows.map((row, i) => (
        <div key={i} className="flex justify-center gap-1.5">
          {i === 2 && !numMode && (
            <button
              onClick={() => setCaps(!caps)}
              className={cn(
                "h-12 px-4 rounded-xl text-sm font-bold border-2 transition-all",
                caps ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-foreground"
              )}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          )}
          {row.map((key) => (
            <button
              key={key}
              onClick={() => press(key)}
              className="h-12 min-w-[2.5rem] px-2 rounded-xl bg-card border-2 border-border text-base font-medium text-foreground hover:bg-muted active:scale-95 transition-all shadow-sm"
            >
              {key}
            </button>
          ))}
          {i === 2 && !numMode && (
            <button
              onClick={backspace}
              className="h-12 px-4 rounded-xl bg-muted border-2 border-border text-foreground hover:bg-destructive/10 active:scale-95 transition-all"
            >
              <Delete className="h-4 w-4" />
            </button>
          )}
          {i === 1 && numMode && (
            <button
              onClick={backspace}
              className="h-12 px-4 rounded-xl bg-muted border-2 border-border text-foreground hover:bg-destructive/10 active:scale-95 transition-all"
            >
              <Delete className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}

      <div className="flex justify-center gap-1.5">
        <button
          onClick={() => setNumMode(!numMode)}
          className="h-12 px-4 rounded-xl bg-muted border-2 border-border text-sm font-bold text-foreground hover:bg-muted/80 active:scale-95 transition-all"
        >
          {numMode ? "ABC" : "123"}
        </button>
        <button
          onClick={space}
          className="h-12 flex-1 max-w-xs rounded-xl bg-card border-2 border-border text-sm text-muted-foreground hover:bg-muted active:scale-95 transition-all"
        >
          space
        </button>
        <button
          onClick={() => onChange(value + "\n")}
          className="h-12 px-4 rounded-xl bg-muted border-2 border-border text-sm font-bold text-foreground hover:bg-muted/80 active:scale-95 transition-all"
        >
          return
        </button>
      </div>
    </div>
  );
}