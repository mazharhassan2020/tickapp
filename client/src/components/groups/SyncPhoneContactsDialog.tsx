/**
 * Import a phone's address book into a new group.
 *
 * Two routes in, because the web platform only offers one of them on Android:
 *  - Contact Picker API (`navigator.contacts.select`) — Chrome on Android. One
 *    tap, the OS shows its own picker, nothing is uploaded.
 *  - A vCard/CSV file — the only option on iPhone, since Safari has never
 *    shipped the picker. iOS Contacts → share → Save to Files produces a .vcf,
 *    and the Files picker is what the file input opens.
 *
 * Parsing happens in the browser; the server only ever sees the finished
 * contact list.
 */
import { useMemo, useRef, useState } from "react";
import { Smartphone, Upload, Loader2, Check, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export interface PhoneContact {
  name: string;
  phone: string;
  email?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId?: string;
  /** Called after a successful import so the caller can refresh its lists. */
  onImported: () => void;
}

/** True when this browser can open the OS contact picker (Android Chrome). */
export function hasContactPicker(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    typeof (navigator as any).contacts?.select === "function"
  );
}

/** Keep digits and a leading +, and drop anything too short to be a number. */
function normalisePhone(raw: string): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return plus ? `+${digits}` : digits;
}

/**
 * vCard 2.1/3.0/4.0 are all line-based, so we only need FN/N for the name and
 * TEL for the number. Folded lines (a leading space or tab continues the
 * previous line) are joined first.
 */
export function parseVCard(text: string): PhoneContact[] {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1);
  const out: PhoneContact[] = [];

  for (const card of cards) {
    const lines = card.split("\n");
    let fn = "";
    let structuredName = "";
    let email = "";
    const phones: string[] = [];

    for (const line of lines) {
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      const key = line.slice(0, sep).toUpperCase();
      const value = line.slice(sep + 1).trim();
      if (!value) continue;

      if (key === "FN" || key.startsWith("FN;")) {
        fn = value;
      } else if (key === "N" || key.startsWith("N;")) {
        // N is Last;First;Middle;Prefix;Suffix
        const [last, first] = value.split(";");
        structuredName = [first, last].filter(Boolean).join(" ").trim();
      } else if (key === "TEL" || key.startsWith("TEL;") || key.startsWith("TEL.")) {
        phones.push(value);
      } else if (key === "EMAIL" || key.startsWith("EMAIL;")) {
        if (!email) email = value;
      }
    }

    const name = (fn || structuredName).replace(/\\,/g, ",").trim();
    for (const tel of phones) {
      const phone = normalisePhone(tel);
      if (!phone) continue;
      out.push({ name: name || phone, phone, email: email || undefined });
    }
  }

  return out;
}

/** A plain CSV export: find the name/phone/email columns by header. */
export function parseCsv(text: string): PhoneContact[] {
  const rows = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  if (rows.length < 2) return [];

  const splitRow = (row: string) =>
    row
      .match(/(".*?"|[^,]+)(?=,|$)/g)
      ?.map((c) => c.replace(/^"|"$/g, "").trim()) ?? [];

  const header = splitRow(rows[0]).map((h) => h.toLowerCase());
  const findCol = (...candidates: string[]) =>
    header.findIndex((h) => candidates.some((c) => h.includes(c)));

  const phoneCol = findCol("phone", "mobile", "number", "tel");
  const nameCol = findCol("name");
  const emailCol = findCol("email", "e-mail");
  if (phoneCol === -1) return [];

  const out: PhoneContact[] = [];
  for (const row of rows.slice(1)) {
    const cells = splitRow(row);
    const phone = normalisePhone(cells[phoneCol] || "");
    if (!phone) continue;
    out.push({
      name: (nameCol > -1 ? cells[nameCol] : "")?.trim() || phone,
      phone,
      email: emailCol > -1 ? cells[emailCol]?.trim() || undefined : undefined,
    });
  }
  return out;
}

/** Same phone twice in one address book is common — keep the first. */
function dedupe(list: PhoneContact[]): PhoneContact[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    if (seen.has(c.phone)) return false;
    seen.add(c.phone);
    return true;
  });
}

function defaultGroupName(): string {
  const now = new Date();
  return `Phone contacts ${now.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export default function SyncPhoneContactsDialog({
  open,
  onOpenChange,
  channelId,
  onImported,
}: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [groupName, setGroupName] = useState(defaultGroupName());
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    duplicates: number;
    invalid: number;
  } | null>(null);

  const pickerAvailable = useMemo(hasContactPicker, []);

  const reset = () => {
    setContacts([]);
    setResult(null);
    setGroupName(defaultGroupName());
    if (fileRef.current) fileRef.current.value = "";
  };

  const pickFromPhone = async () => {
    try {
      setIsReading(true);
      const picked = await (navigator as any).contacts.select(
        ["name", "tel", "email"],
        { multiple: true }
      );
      const mapped: PhoneContact[] = [];
      for (const entry of picked || []) {
        const name = (entry.name?.[0] || "").trim();
        const email = entry.email?.[0];
        for (const tel of entry.tel || []) {
          const phone = normalisePhone(tel);
          if (!phone) continue;
          mapped.push({ name: name || phone, phone, email });
        }
      }
      const list = dedupe(mapped);
      setContacts(list);
      setResult(null);
      if (list.length === 0) {
        toast({
          title: "Nothing to import",
          description: "None of the selected contacts had a usable phone number.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      // A cancelled picker rejects too — that is not worth an error toast.
      if (err?.name !== "AbortError") {
        toast({
          title: "Could not read contacts",
          description: err?.message || "The contact picker was not available.",
          variant: "destructive",
        });
      }
    } finally {
      setIsReading(false);
    }
  };

  const readFile = async (file: File) => {
    setIsReading(true);
    setResult(null);
    try {
      const text = await file.text();
      const isCsv = /\.csv$/i.test(file.name) || text.trimStart().toLowerCase().startsWith("name,");
      const parsed = isCsv ? parseCsv(text) : parseVCard(text);
      const list = dedupe(parsed);
      setContacts(list);
      if (list.length === 0) {
        toast({
          title: "No contacts found",
          description:
            "That file had no readable phone numbers. Export your contacts as a vCard (.vcf) or CSV and try again.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Could not read that file",
        description: err?.message || "Unsupported file",
        variant: "destructive",
      });
    } finally {
      setIsReading(false);
    }
  };

  const doImport = async () => {
    const name = groupName.trim();
    if (!name) {
      return toast({
        title: "Segment name is required",
        description: "Give the new segment a name before importing.",
        variant: "destructive",
      });
    }
    if (contacts.length === 0) return;

    setIsImporting(true);
    try {
      // Create the segment first so it shows on this page even if every contact
      // turns out to be a duplicate. A name that already exists is fine — the
      // contacts just get tagged into it.
      await apiRequest("POST", "/api/groups", {
        name,
        description: "Imported from a phone's contacts",
        channelId,
      }).catch(() => undefined);

      const res = await apiRequest("POST", "/api/contacts/import", {
        channelId,
        groupName: name,
        contacts: contacts.map((c) => ({
          name: c.name,
          phone: c.phone,
          email: c.email || null,
          groups: [name],
        })),
      });
      const data = await res.json();

      setResult({
        imported: data.imported ?? 0,
        duplicates: data.duplicates ?? 0,
        invalid: data.invalid ?? 0,
      });
      onImported();
      toast({
        title: "Contacts imported",
        description: `${data.imported ?? 0} added to "${name}".`,
      });
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err?.message || "Could not import these contacts",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Sync contacts from your phone
          </DialogTitle>
          <DialogDescription>
            Bring your phone's contacts in as a new segment.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-green-800">
                  {result.imported} contact{result.imported === 1 ? "" : "s"} added to
                  "{groupName.trim()}"
                </p>
                {result.duplicates > 0 && (
                  <p className="text-green-700 mt-1">
                    {result.duplicates} were already in your contacts and have been
                    tagged into this segment.
                  </p>
                )}
                {result.invalid > 0 && (
                  <p className="text-amber-700 mt-1">
                    {result.invalid} could not be read and were skipped.
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Import more
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {pickerAvailable ? (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={pickFromPhone}
                  disabled={isReading || isImporting}
                >
                  {isReading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Smartphone className="w-4 h-4 mr-2" />
                  )}
                  Choose from phone contacts
                </Button>
                <p className="text-xs text-gray-500 text-center">
                  Your phone decides which contacts are shared — nothing is read
                  automatically.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">On iPhone, export your contacts first</p>
                  <p className="mt-1 text-blue-800">
                    Safari does not let a website read your address book. Open
                    <b> Contacts</b>, select the people you want, tap
                    <b> Share</b> → <b>Save to Files</b>, then choose that
                    <b> .vcf</b> file below. Exporting a vCard from
                    <b> iCloud.com → Contacts</b> works too.
                  </p>
                </div>
              </div>
            )}

            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".vcf,.vcard,text/vcard,text/x-vcard,.csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) readFile(file);
                }}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileRef.current?.click()}
                disabled={isReading || isImporting}
              >
                {isReading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Choose a contacts file (.vcf or .csv)
              </Button>
            </div>

            {contacts.length > 0 && (
              <>
                <div className="rounded-lg border border-gray-200">
                  <div className="px-3 py-2 border-b bg-gray-50 text-sm font-medium">
                    {contacts.length} contact{contacts.length === 1 ? "" : "s"} ready
                  </div>
                  <div className="max-h-44 overflow-y-auto divide-y">
                    {contacts.slice(0, 100).map((c, i) => (
                      <div key={`${c.phone}-${i}`} className="px-3 py-2 text-sm">
                        <div className="font-medium text-gray-900 truncate">
                          {c.name}
                        </div>
                        <div className="text-gray-500">{c.phone}</div>
                      </div>
                    ))}
                    {contacts.length > 100 && (
                      <div className="px-3 py-2 text-xs text-gray-500">
                        and {contacts.length - 100} more…
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="segment-name">New segment name</Label>
                  <Input
                    id="segment-name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Phone contacts"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={reset} disabled={isImporting}>
                    Clear
                  </Button>
                  <Button onClick={doImport} disabled={isImporting}>
                    {isImporting && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Import {contacts.length} into segment
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
