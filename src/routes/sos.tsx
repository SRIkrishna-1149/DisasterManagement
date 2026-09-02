import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Crosshair, MapPin, ShieldAlert } from "lucide-react";
import { OperationsMap } from "@/components/map-panel";
import { AuthGate, LocationConfidence, PageFrame } from "@/components/portal";
import { Button, ErrorState, Field, inputClass, Panel } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { useEmergencyLocation } from "@/hooks/useEmergencyLocation";
import {
  isInsideIndia,
  LOCATION_CONFIDENCE,
  SEVERITIES,
  SOS_CATEGORIES,
  type Severity,
} from "@/lib/domain";
import { findActiveSos, looksDuplicate, submitSos, type SosDraft } from "@/lib/sos-service";
import type { TransmissionState } from "@/lib/domain";

export const Route = createFileRoute("/sos")({ component: SosRoute });

function SosRoute() {
  return (
    <AuthGate>
      <SosForm />
    </AuthGate>
  );
}

function SosForm() {
  const { user } = useAuth();
  const { location, status: locationStatus, request, setManual } = useEmergencyLocation();
  const [category, setCategory] = useState("trapped");
  const [severity, setSeverity] = useState<Severity>("HIGH");
  const [people, setPeople] = useState("1");
  const [description, setDescription] = useState("");
  const [medicalNeeds, setMedicalNeeds] = useState("");
  const [medical, setMedical] = useState(false);
  const [vulnerable, setVulnerable] = useState(false);
  const [source, setSource] = useState<"GPS" | "MANUAL_PIN" | "LANDMARK">("GPS");
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [landmark, setLandmark] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ reference: number; id: string } | null>(null);
  const [sent, setSent] = useState(false);
  const [transmissionState, setTransmissionState] = useState<TransmissionState>("QUEUED");
  const [busy, setBusy] = useState(false);

  const effectiveLocation =
    source === "GPS"
      ? location
      : source === "MANUAL_PIN"
        ? Number.isFinite(Number(manualLat)) && Number.isFinite(Number(manualLng))
          ? {
              lat: Number(manualLat),
              lng: Number(manualLng),
              source,
              accuracyM: null,
              landmark: null,
              capturedAt: new Date().toISOString(),
            }
          : null
        : null;

  function useManualLocation() {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180 ||
      (lat === 0 && lng === 0) ||
      !isInsideIndia(lat, lng)
    ) {
      setError("Enter coordinates within the India operating area, or use a landmark instead.");
      return;
    }
    setManual(lat, lng, null, "MANUAL_PIN");
    setSource("MANUAL_PIN");
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>, force = false) {
    event.preventDefault();
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      if (source === "LANDMARK" && !landmark)
        throw new Error("Choose the nearest landmark so responders have an approximate location.");
      if (source !== "LANDMARK" && !effectiveLocation)
        throw new Error("Location is needed. Allow GPS, enter a manual pin, or choose a landmark.");
      if (effectiveLocation && !isInsideIndia(effectiveLocation.lat, effectiveLocation.lng))
        throw new Error("The emergency location must be within the India operating area.");
      const draft: SosDraft = {
        reporter_name: null,
        people_count: Math.max(1, Math.floor(Number(people) || 1)),
        category,
        severity,
        description: description.trim() || null,
        medical_needs: medicalNeeds.trim() || null,
        has_medical_emergency: medical,
        has_vulnerable_people: vulnerable,
        latitude: source === "LANDMARK" ? null : (effectiveLocation?.lat ?? null),
        longitude: source === "LANDMARK" ? null : (effectiveLocation?.lng ?? null),
        location_source: source,
        location_accuracy_m: source === "GPS" ? (location?.accuracyM ?? null) : null,
        landmark: source === "LANDMARK" ? landmark : null,
      };
      if (!force) {
        const active = await findActiveSos(user.id);
        const match = looksDuplicate(active, draft);
        if (match) {
          setDuplicate({ reference: match.reference, id: match.id });
          setBusy(false);
          return;
        }
      }
      const transmission = await submitSos(draft, user.id);
      setTransmissionState(transmission.state);
      setSent(true);
      setDuplicate(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "SOS could not be queued. Keep this screen open and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <PageFrame
        eyebrow="Emergency / transmission"
        title={
          transmissionState === "TRANSMITTED"
            ? "SOS sent for response"
            : "SOS queued for transmission"
        }
        description={
          transmissionState === "TRANSMITTED"
            ? "The response system confirmed receipt. Responder notification delivery and acceptance are tracked separately."
            : "Your request is protected on this device but has not yet been received by the response team. It will retry automatically when connectivity returns."
        }
        actions={
          <Link to="/my-sos">
            <Button variant="primary">Track my SOS</Button>
          </Link>
        }
      >
        <Panel className="max-w-2xl">
          <div className="flex gap-4">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-safe" />
            <div>
              <h2 className="text-lg font-bold">
                {transmissionState === "TRANSMITTED" ? "SOS SENT" : "SOS QUEUED"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {transmissionState === "TRANSMITTED"
                  ? "The backend has acknowledged this request. Do not assume responder acceptance until My SOS shows validation."
                  : "The request remains queued and will retry automatically. Keep your connection on if possible."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/my-sos">
                  <Button size="sm">View request status</Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSent(false);
                    setDescription("");
                  }}
                >
                  Submit another update
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      </PageFrame>
    );

  return (
    <PageFrame
      eyebrow="Community / emergency request"
      title="Send an SOS"
      description="Share only the information responders need. Your request is assigned a unique key, queued locally first, and never marked received without server acknowledgement."
    >
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={(event) => void submit(event)} className="space-y-5">
          <Panel title="What is happening?">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Emergency type">
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className={inputClass}
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
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as Severity)}
                  className={inputClass}
                >
                  {SEVERITIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="People needing help" hint="Include yourself.">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  min="1"
                  max="999"
                  type="number"
                  value={people}
                  onChange={(event) => setPeople(event.target.value)}
                />
              </Field>
              <div className="flex items-end gap-4 pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={medical}
                    onChange={(event) => setMedical(event.target.checked)}
                    className="h-4 w-4 accent-[var(--color-destructive)]"
                  />
                  Medical emergency
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={vulnerable}
                    onChange={(event) => setVulnerable(event.target.checked)}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  Child / elderly
                </label>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              <Field
                label="What should responders know?"
                hint="Avoid passwords or unnecessary personal details."
              >
                <textarea
                  className={`${inputClass} min-h-24 py-3`}
                  maxLength={1000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Example: water is entering the ground floor…"
                />
              </Field>
              {medical && (
                <Field label="Medical needs">
                  <input
                    className={inputClass}
                    maxLength={300}
                    value={medicalNeeds}
                    onChange={(event) => setMedicalNeeds(event.target.value)}
                    placeholder="Example: asthma medication needed"
                  />
                </Field>
              )}
            </div>
          </Panel>
          <Panel
            title="Where are you?"
            action={
              <Button type="button" size="sm" onClick={request}>
                <Crosshair className="h-4 w-4" />
                Use GPS
              </Button>
            }
          >
            <div className="flex flex-wrap gap-2">
              {(["GPS", "MANUAL_PIN", "LANDMARK"] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => {
                    setSource(item);
                    setError(null);
                  }}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold ${source === item ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {LOCATION_CONFIDENCE[item].label}
                </button>
              ))}
            </div>
            {source === "GPS" && (
              <div className="mt-4 rounded-lg border border-border bg-surface/60 p-3">
                {locationStatus === "locating" && (
                  <p className="text-sm text-muted-foreground">Requesting a precise location…</p>
                )}
                {locationStatus === "denied" && (
                  <p className="text-sm text-accent">
                    GPS permission was denied. Use a manual pin or landmark below.
                  </p>
                )}
                {locationStatus === "unavailable" && (
                  <p className="text-sm text-accent">GPS is unavailable on this device.</p>
                )}
                {locationStatus === "outside-region" && (
                  <p className="text-sm text-accent">
                    GPS is outside the Andhra Pradesh operating area. Use a manual pin or landmark.
                  </p>
                )}
                {location && (
                  <LocationConfidence
                    source="GPS"
                    accuracyM={location.accuracyM}
                    updatedAt={location.capturedAt}
                  />
                )}
                {!location && locationStatus === "idle" && (
                  <p className="text-sm text-muted-foreground">
                    Location has not been captured yet.
                  </p>
                )}
              </div>
            )}
            {source === "MANUAL_PIN" && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Tap or click the map to place a pin, then confirm the coordinates below.
                </p>
                <OperationsMap
                  markers={[]}
                  title="Drop a manual pin"
                  {...(Number.isFinite(Number(manualLat)) && Number.isFinite(Number(manualLng))
                    ? { pin: { lat: Number(manualLat), lng: Number(manualLng) } }
                    : {})}
                  onMapClick={(point) => {
                    setManualLat(point.lat.toFixed(5));
                    setManualLng(point.lng.toFixed(5));
                    setError(null);
                  }}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Latitude">
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={manualLat}
                      onChange={(event) => setManualLat(event.target.value)}
                      placeholder="16.5062"
                    />
                  </Field>
                  <Field label="Longitude">
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={manualLng}
                      onChange={(event) => setManualLng(event.target.value)}
                      placeholder="80.6480"
                    />
                  </Field>
                </div>
                <Button type="button" size="sm" onClick={useManualLocation}>
                  Set manual pin
                </Button>
              </div>
            )}
            {source === "LANDMARK" && (
              <div className="mt-4">
                <Field
                  label="Nearest landmark"
                  hint="This is approximate; responders will confirm on contact."
                >
                  <input
                    className={inputClass}
                    maxLength={200}
                    value={landmark}
                    onChange={(event) => setLandmark(event.target.value)}
                    placeholder="School, temple, junction, or building name"
                  />
                </Field>
              </div>
            )}
          </Panel>
          {error && <ErrorState message={error} />}
          {duplicate && (
            <div className="rounded-lg border border-accent/50 bg-accent/10 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-accent" />
                <div className="text-sm">
                  <p className="font-semibold">
                    You already have a nearby active SOS #{duplicate.reference}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Update or track that request to avoid duplicate dispatch. Send a new request
                    only if this is a separate emergency.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to="/my-sos">
                      <Button type="button" size="sm">
                        Track existing SOS
                      </Button>
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={(event) =>
                        void submit(event as unknown as FormEvent<HTMLFormElement>, true)
                      }
                    >
                      Send separate SOS
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <Button
            type="submit"
            variant="danger"
            size="xl"
            className="w-full sm:w-auto"
            disabled={busy}
          >
            <ShieldAlert className="h-5 w-5" />
            {busy ? "Securing request…" : "Send SOS now"}
          </Button>
        </form>
        <aside className="space-y-5">
          <Panel title="Before you send">
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary">01</span>
                <span>
                  Give the clearest location available. GPS is precise; a landmark is approximate.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">02</span>
                <span>State how many people need help and whether anyone is injured.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">03</span>
                <span>After sending, stay reachable and follow the latest official direction.</span>
              </li>
            </ul>
          </Panel>
          <Panel title="Privacy">
            <p className="text-sm leading-6 text-muted-foreground">
              Your private location is shared with authorised operators for this response. Community
              reports are a separate, less precise channel.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-safe">
              <MapPin className="h-4 w-4" />
              Location confidence is always shown to responders.
            </div>
          </Panel>
        </aside>
      </div>
    </PageFrame>
  );
}
