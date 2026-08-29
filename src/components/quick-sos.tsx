import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AlertTriangle, Crosshair, MapPin, ShieldAlert, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEmergencyLocation } from "@/hooks/useEmergencyLocation";
import {
  isInsideAndhraPradesh,
  LOCATION_CONFIDENCE,
  SEVERITIES,
  SOS_CATEGORIES,
  type Severity,
} from "@/lib/domain";
import { findActiveSos, looksDuplicate, submitSos, type SosDraft } from "@/lib/sos-service";
import { Button, ErrorState, Field, inputClass } from "./kit";

export function QuickSosDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { location, status, request } = useEmergencyLocation();
  const [category, setCategory] = useState("trapped");
  const [severity, setSeverity] = useState<Severity>("HIGH");
  const [people, setPeople] = useState("1");
  const [description, setDescription] = useState("");
  const [medicalNeeds, setMedicalNeeds] = useState("");
  const [medical, setMedical] = useState(false);
  const [vulnerable, setVulnerable] = useState(false);
  const [source, setSource] = useState<"GPS" | "MANUAL_PIN" | "LANDMARK">("GPS");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [landmark, setLandmark] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; reference: number } | null>(null);

  const coordinate =
    source === "GPS"
      ? location
      : source === "MANUAL_PIN" && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
        ? { lat: Number(lat), lng: Number(lng), accuracyM: null }
        : null;

  async function send(event: FormEvent<HTMLFormElement>, force = false) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (source === "LANDMARK" && !landmark.trim()) throw new Error("Enter the nearest landmark.");
      if (
        source === "MANUAL_PIN" &&
        (!coordinate ||
          Math.abs(coordinate.lat) > 90 ||
          Math.abs(coordinate.lng) > 180 ||
          (coordinate.lat === 0 && coordinate.lng === 0) ||
          !isInsideAndhraPradesh(coordinate.lat, coordinate.lng))
      )
        throw new Error("Enter a valid Andhra Pradesh latitude and longitude.");
      if (source === "GPS" && coordinate && !isInsideAndhraPradesh(coordinate.lat, coordinate.lng))
        throw new Error(
          "GPS is outside the Andhra Pradesh operating area. Use a manual pin or landmark.",
        );
      if (source === "GPS" && !coordinate)
        throw new Error("GPS is not ready. Use a manual pin or landmark if you cannot wait.");
      const draft: SosDraft = {
        reporter_name: null,
        people_count: Math.max(1, Math.min(999, Math.floor(Number(people) || 1))),
        category,
        severity,
        description: description.trim() || null,
        medical_needs: medicalNeeds.trim() || null,
        has_medical_emergency: medical,
        has_vulnerable_people: vulnerable,
        latitude: coordinate?.lat ?? null,
        longitude: coordinate?.lng ?? null,
        location_source: source,
        location_accuracy_m: source === "GPS" ? (location?.accuracyM ?? null) : null,
        landmark: source === "LANDMARK" ? landmark.trim() : null,
      };
      if (!force) {
        const match = looksDuplicate(await findActiveSos(user.id), draft);
        if (match) {
          setDuplicate({ id: match.id, reference: match.reference });
          setBusy(false);
          return;
        }
      }
      const transmission = await submitSos(draft, user.id);
      setNotice(
        transmission.state === "TRANSMITTED"
          ? "SOS SENT. The response system confirmed the request; responder notification delivery is tracked separately. My SOS will show when a responder accepts it."
          : "SOS QUEUED. Your request has not yet been received by the response team and will retry when connectivity returns.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SOS could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-sos-title"
        className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-destructive/40 bg-background p-5 shadow-2xl sm:rounded-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-destructive uppercase">
              Instant emergency channel
            </p>
            <h2 id="quick-sos-title" className="mt-1 text-2xl font-bold">
              Send an SOS
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The request is saved server-side first; email delivery and responder acceptance are
              tracked separately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close instant SOS form"
            className="rounded-md p-2 text-muted-foreground hover:bg-surface-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {!user ? (
          <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-semibold">Sign in before sending an emergency request.</p>
            <Link to="/auth" onClick={onClose} className="mt-3 inline-block">
              <Button variant="primary">Sign in securely</Button>
            </Link>
          </div>
        ) : notice ? (
          <div className="mt-6 rounded-lg border border-safe/40 bg-safe/10 p-4">
            <p className="font-semibold text-safe">SOS request saved</p>
            <p className="mt-2 text-sm text-muted-foreground">{notice}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/my-sos" onClick={onClose}>
                <Button variant="primary">Track acceptance</Button>
              </Link>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void send(event)} className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Emergency type">
                <select
                  className={inputClass}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {SOS_CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Urgency">
                <select
                  className={inputClass}
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as Severity)}
                >
                  {SEVERITIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="People needing help">
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  max="999"
                  value={people}
                  onChange={(event) => setPeople(event.target.value)}
                />
              </Field>
              <div className="flex items-end gap-4 pb-2 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={medical}
                    onChange={(event) => setMedical(event.target.checked)}
                  />
                  Medical
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vulnerable}
                    onChange={(event) => setVulnerable(event.target.checked)}
                  />
                  Child / elderly
                </label>
              </div>
            </div>
            <Field label="What should responders know?">
              <textarea
                className={`${inputClass} min-h-20 py-2`}
                maxLength={1000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the danger, injuries, or changing conditions…"
              />
            </Field>
            {medical && (
              <Field label="Medical needs">
                <input
                  className={inputClass}
                  value={medicalNeeds}
                  onChange={(event) => setMedicalNeeds(event.target.value)}
                  placeholder="Medication or treatment needed"
                />
              </Field>
            )}
            <div className="rounded-lg border border-border bg-surface/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4 text-primary" />
                  Where are you?
                </p>
                <Button type="button" size="sm" onClick={request}>
                  <Crosshair className="h-4 w-4" />
                  Use GPS
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["GPS", "MANUAL_PIN", "LANDMARK"] as const).map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setSource(item)}
                    className={`rounded border px-2.5 py-1.5 text-xs font-semibold ${source === item ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
                  >
                    {LOCATION_CONFIDENCE[item].label}
                  </button>
                ))}
              </div>
              {source === "GPS" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {location
                    ? `GPS ready · ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}${location.accuracyM ? ` · accuracy ${Math.round(location.accuracyM)} m` : ""}`
                    : status === "locating"
                      ? "Requesting GPS…"
                      : status === "outside-region"
                        ? "GPS is outside the Andhra Pradesh operating area. Use a manual pin or landmark."
                        : "GPS unavailable or not yet granted."}
                </p>
              )}
              {source === "MANUAL_PIN" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    aria-label="Latitude"
                    className={inputClass}
                    value={lat}
                    onChange={(event) => setLat(event.target.value)}
                    placeholder="Latitude"
                  />
                  <input
                    aria-label="Longitude"
                    className={inputClass}
                    value={lng}
                    onChange={(event) => setLng(event.target.value)}
                    placeholder="Longitude"
                  />
                </div>
              )}
              {source === "LANDMARK" && (
                <input
                  aria-label="Nearest landmark"
                  className={`${inputClass} mt-3`}
                  value={landmark}
                  onChange={(event) => setLandmark(event.target.value)}
                  placeholder="Nearest landmark or junction"
                />
              )}
            </div>
            {error && <ErrorState message={error} />}
            {duplicate && (
              <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
                <p className="flex items-center gap-2 font-semibold text-accent">
                  <AlertTriangle className="h-4 w-4" />
                  Active SOS #{duplicate.reference} already exists
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Track it to avoid duplicate dispatch, or confirm this is a separate emergency.
                </p>
                <div className="mt-3 flex gap-2">
                  <Link to="/my-sos">
                    <Button type="button" size="sm">
                      Track existing
                    </Button>
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={(event) =>
                      void send(event as unknown as FormEvent<HTMLFormElement>, true)
                    }
                  >
                    Send separate
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                Never wait for email if danger is immediate.
              </p>
              <Button type="submit" variant="danger" size="lg" disabled={busy}>
                {busy ? "Securing SOS…" : "Send SOS now"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
