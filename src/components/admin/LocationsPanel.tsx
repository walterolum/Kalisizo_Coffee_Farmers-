"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Building2,
  FileText,
  Loader2,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";
import { ErrorState, useConfirm } from "@/components/admin/ui";
import {
  apiFetch,
  Field,
  inputBase,
  Panel,
  publishAndFeedback,
} from "@/components/admin/panel-kit";
import { useRealtimePoll } from "@/lib/realtime";
import { sessionExpired } from "@/lib/admin-api";
import type { SaveResult as PublishResult } from "@/lib/save-outcome";

/**
 * Store locations panel.
 *
 * Extracted verbatim from `AdminClient.tsx`; the behaviour is unchanged.
 *
 * `StoreLocation` has no status column, so a saved location is on the public site
 * straight away and the panel reads the public `/api/v1/locations` list. The
 * write still goes through `/api/v1/admin/locations`, which checks the
 * permission server-side regardless of what the sidebar shows.
 */

type StoreLocationItem = {
  id: string;
  name: string;
  address: string | null;
  district: string | null;
  subCounty: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  isMainBranch: boolean;
};

export function LocationPanel({
  notify,
  onSessionError,
}: {
  notify: (message: string, kind?: "success" | "error") => void;
  onSessionError: (error: unknown) => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [locations, setLocations] = useState<StoreLocationItem[] | null>(null);
  const [locSaving, setLocSaving] = useState(false);
  const [locEditingId, setLocEditingId] = useState<string | undefined>(
    undefined,
  );
  const [locForm, setLocForm] = useState({
    name: "",
    address: "",
    subCounty: "",
    district: "",
    latitude: "",
    longitude: "",
    phone: "",
    email: "",
    isMainBranch: false,
  });

  /**
   * Why the last load failed, if it did.
   *
   * `load` used to hand every failure to `onSessionError`, which only acts on a
   * 401. A 500, a 503 or a dropped connection therefore vanished: `locations`
   * stayed `null` and the panel showed its spinner forever, with no message and
   * no way to retry.
   */
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const storeLocations =
        await apiFetch<StoreLocationItem[]>("/api/v1/locations");
      setLocations(storeLocations);
      setLoadError(null);
    } catch (error) {
      if (sessionExpired(error)) {
        onSessionError(error);
        return;
      }
      setLoadError(
        error instanceof Error && error.message
          ? error.message
          : "Could not load store locations.",
      );
    }
  }, [onSessionError]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useRealtimePoll(load, undefined, "locations");

  const resetLocationForm = () => {
    setLocEditingId(undefined);
    setLocForm({
      name: "",
      address: "",
      subCounty: "",
      district: "",
      latitude: "",
      longitude: "",
      phone: "",
      email: "",
      isMainBranch: false,
    });
  };

  const startEditLocation = (location: StoreLocationItem) => {
    setLocEditingId(location.id);
    setLocForm({
      name: location.name,
      address: location.address ?? "",
      subCounty: location.subCounty ?? "",
      district: location.district ?? "",
      latitude: location.latitude != null ? String(location.latitude) : "",
      longitude: location.longitude != null ? String(location.longitude) : "",
      phone: location.phone ?? "",
      email: location.email ?? "",
      isMainBranch: location.isMainBranch,
    });
  };

  const submitLocation = async (e: FormEvent) => {
    e.preventDefault();
    setLocSaving(true);
    try {
      const ok = await publishAndFeedback(notify, onSessionError, () =>
        apiFetch<PublishResult>("/api/v1/admin/locations", {
          method: "POST",
          body: JSON.stringify({
            id: locEditingId,
            name: locForm.name,
            address: locForm.address,
            subCounty: locForm.subCounty,
            district: locForm.district,
            latitude: locForm.latitude === "" ? null : Number(locForm.latitude),
            longitude:
              locForm.longitude === "" ? null : Number(locForm.longitude),
            phone: locForm.phone,
            email: locForm.email,
            isMainBranch: locForm.isMainBranch,
          }),
        }),
      );
      if (ok) {
        resetLocationForm();
        await load();
      }
    } finally {
      setLocSaving(false);
    }
  };

  const removeLocation = async (location: StoreLocationItem) => {
    const ok = await confirm({
      title: `Delete “${location.name}”?`,
      body: "This location will be removed from the public site. This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/v1/admin/locations/${location.id}`, {
        method: "DELETE",
      });
      notify("Location deleted.");
      await load();
    } catch (error) {
      onSessionError(error);
      notify("Could not delete location.");
    }
  };

  return (
    <div className="grid gap-6">
      {confirmDialog}
      <Panel title="Store Locations" icon={<Building2 className="size-5" />}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-cream/50">
              {locEditingId ? "Edit location" : "Add a location"}
            </h3>
            <form onSubmit={submitLocation} className="mt-4 space-y-4">
              <Field label="Name">
                <input
                  value={locForm.name}
                  onChange={(e) =>
                    setLocForm({ ...locForm, name: e.target.value })
                  }
                  required
                  className={inputBase}
                  placeholder="e.g. Kalisizo Buying Point"
                />
              </Field>
              <Field label="Address">
                <input
                  value={locForm.address}
                  onChange={(e) =>
                    setLocForm({ ...locForm, address: e.target.value })
                  }
                  className={inputBase}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Sub county">
                  <input
                    value={locForm.subCounty}
                    onChange={(e) =>
                      setLocForm({ ...locForm, subCounty: e.target.value })
                    }
                    className={inputBase}
                    placeholder="Kalisizo Sub County"
                  />
                </Field>
                <Field label="District">
                  <input
                    value={locForm.district}
                    onChange={(e) =>
                      setLocForm({ ...locForm, district: e.target.value })
                    }
                    className={inputBase}
                    placeholder="Kyotera District"
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Latitude">
                  <input
                    value={locForm.latitude}
                    onChange={(e) =>
                      setLocForm({ ...locForm, latitude: e.target.value })
                    }
                    className={inputBase}
                    placeholder="-0.5962"
                  />
                </Field>
                <Field label="Longitude">
                  <input
                    value={locForm.longitude}
                    onChange={(e) =>
                      setLocForm({ ...locForm, longitude: e.target.value })
                    }
                    className={inputBase}
                    placeholder="31.5722"
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone">
                  <input
                    value={locForm.phone}
                    onChange={(e) =>
                      setLocForm({ ...locForm, phone: e.target.value })
                    }
                    className={inputBase}
                    placeholder="+256 774 740 871"
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={locForm.email}
                    onChange={(e) =>
                      setLocForm({ ...locForm, email: e.target.value })
                    }
                    className={inputBase}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2.5 text-sm font-semibold text-cream/80">
                <input
                  type="checkbox"
                  checked={locForm.isMainBranch}
                  onChange={(e) =>
                    setLocForm({ ...locForm, isMainBranch: e.target.checked })
                  }
                  className="size-4 accent-[#d5a83d]"
                />
                Main branch (displayed on the website)
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={locSaving}
                  className="btn btn-primary flex-1"
                >
                  {locSaving ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : locEditingId ? (
                    <FileText className="size-4" aria-hidden="true" />
                  ) : (
                    <Plus className="size-4" aria-hidden="true" />
                  )}
                  {locEditingId ? "Save changes" : "Add location"}
                </button>
                <button
                  type="button"
                  onClick={resetLocationForm}
                  className="btn btn-ghost-soft"
                >
                  Reset
                </button>
              </div>
            </form>
          </div>

          {/* A failed first load gets a retry. A failed refresh while we already hold
              data keeps the list and adds a banner. */}
          {loadError && !locations && (
            <ErrorState
              title="Could not load store locations"
              message={loadError}
              onRetry={() => void load()}
            />
          )}
          {loadError && locations && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300 ring-1 ring-red-400/20"
            >
              Showing the last successful load. Could not refresh: {loadError}
            </p>
          )}

          {(!loadError || locations) && (
            <ul className="space-y-3">
              {!locations ? (
                <li className="grid place-items-center py-12 text-cream/50">
                  <Loader2 className="size-6 animate-spin" />
                </li>
              ) : locations.length === 0 ? (
                <li className="rounded-2xl bg-white/5 px-4 py-10 text-center text-sm text-cream/50">
                  No store locations yet.
                </li>
              ) : (
                locations.map((location) => (
                  <li
                    key={location.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 ring-1 ring-white/10"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-light">
                        <MapPin className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {location.name}
                          {location.isMainBranch && (
                            <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-light">
                              Main
                            </span>
                          )}
                        </p>
                        <p className="text-[12px] text-cream/55">
                          {[location.subCounty, location.district]
                            .filter(Boolean)
                            .join(", ") || "—"}
                          {location.latitude != null
                            ? ` · ${location.latitude.toFixed(4)}, ${location.longitude?.toFixed(4)}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditLocation(location)}
                        className="btn btn-ghost-soft btn-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLocation(location)}
                        aria-label={`Delete ${location.name}`}
                        className="grid size-8 place-items-center rounded-lg bg-red-500/10 text-red-300 ring-1 ring-red-400/20 transition-colors hover:bg-red-500/20"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}
