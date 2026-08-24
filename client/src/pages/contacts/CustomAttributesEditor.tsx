import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X, Plus } from "lucide-react";

type Fields = Record<string, string>;

/**
 * Key/value editor for a contact's custom attributes. Order-preserving via a
 * parallel array of [key, value] pairs so editing a key doesn't lose position.
 */
export function CustomAttributesEditor({
  value,
  onChange,
  max = 50,
}: {
  value: Fields;
  onChange: (v: Fields) => void;
  max?: number;
}) {
  const rows = Object.entries(value || {});

  const commit = (pairs: [string, string][]) => {
    const obj: Fields = {};
    for (const [k, v] of pairs) {
      const key = k.trim();
      if (key) obj[key] = v;
    }
    onChange(obj);
  };

  const setRow = (i: number, k: string, v: string) => {
    const pairs = rows.map(([kk, vv], idx) =>
      idx === i ? ([k, v] as [string, string]) : ([kk, vv] as [string, string])
    );
    commit(pairs);
  };

  const removeRow = (i: number) => commit(rows.filter((_, idx) => idx !== i));

  const addRow = () => {
    if (rows.length >= max) return;
    // Use a temporary unique empty key so the new row renders.
    const tmp = `field_${rows.length + 1}`;
    onChange({ ...value, [tmp]: "" });
  };

  return (
    <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Custom Attributes</Label>
        <span className="text-xs text-gray-500">
          {rows.length}/{max}
        </span>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-gray-500">No custom attributes yet.</p>
      )}
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            className="flex-1"
            placeholder="Attribute name"
            value={k}
            onChange={(e) => setRow(i, e.target.value, v)}
          />
          <Input
            className="flex-1"
            placeholder="Value"
            value={v}
            onChange={(e) => setRow(i, k, e.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeRow(i)}
          >
            <X className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={rows.length >= max}
      >
        <Plus className="w-4 h-4 mr-1" /> Add attribute
      </Button>
    </div>
  );
}
