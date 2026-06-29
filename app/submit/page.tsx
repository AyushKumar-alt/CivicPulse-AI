"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRequireAuth } from "@/lib/hooks/useRequireAuth";
import { createIssue } from "@/lib/firebase/firestore";
import { uploadToCloudinary } from "@/lib/cloudinary/upload";
import { reverseGeocode } from "@/lib/geocode";

export default function SubmitPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useRequireAuth();

  // Image state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");

  // Form state
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [locationAddress, setLocationAddress] = useState<string | null>(null);
  const [locationZone, setLocationZone] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [contextHint, setContextHint] = useState("None");
  const [customContext, setCustomContext] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setImageError("Image must be under 10 MB.");
      return;
    }

    setImagePreview(URL.createObjectURL(file));
    setImageUrl(null);
    setImageError("");
    setImageUploading(true);

    try {
      const url = await uploadToCloudinary(file);
      setImageUrl(url);
    } catch (err) {
      console.error(err);
      setImageError("Upload failed. Please try again.");
      setImagePreview(null);
    } finally {
      setImageUploading(false);
    }
  }

  function handleRemoveImage() {
    setImagePreview(null);
    setImageUrl(null);
    setImageError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleGetLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const lat = coords.latitude;
        const lng = coords.longitude;
        setLocation({ lat, lng });
        setLocationLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        setLocationAddress(null);
        setLocationZone(null);
        setGeoLoading(false);

        // Best-effort client-side geocode for address preview
        reverseGeocode(lat, lng)
          .then((geo) => {
            if (geo) {
              setLocationAddress(geo.address);
              setLocationZone(geo.zone_type ?? null);
            }
          })
          .catch(() => {/* silently ignore — coords still work */});
      },
      () => {
        setError("Could not get your location. Please try again.");
        setGeoLoading(false);
      }
    );
  }

  async function handleSubmit() {
    if (!user) return;
    if (imageUploading) { setError("Image is still uploading, please wait."); return; }
    if (!imageUrl) { setError("Please upload a photo."); return; }
    if (!location) { setError("Please set your location."); return; }

    setError("");
    setSubmitting(true);
    try {
      const resolvedHint =
        contextHint === "None" ? undefined
        : contextHint === "Other" ? (customContext.trim() || undefined)
        : contextHint;

      const issueId = await createIssue({
        reporterUid: user.uid,
        rawDescription: description,
        imageUrl,
        location,
        contextHint: resolvedHint,
      });

      await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
      });

      router.push(`/issues/${issueId}`);
    } catch (err) {
      console.error(err);
      setError("Failed to submit report. Please try again.");
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  const canSubmit = !!imageUrl && !imageUploading && !!location && !submitting;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
          ← Back
        </Link>
        <h1 className="text-base font-semibold text-gray-900">Report an Issue</h1>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8">
        <div className="space-y-6">

          {/* Step 1 — Photo */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              Step 1 — Upload Photo
            </h2>

            {imagePreview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Issue preview"
                  className="w-full h-48 object-cover rounded-lg"
                />
                {imageUploading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                      Uploading...
                    </div>
                  </div>
                )}
                {!imageUploading && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 bg-white rounded-full px-2 py-0.5 text-xs text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50"
                  >
                    Remove
                  </button>
                )}
                {!imageUploading && imageUrl && (
                  <div className="absolute top-2 left-2 bg-green-600 text-white rounded-full px-2 py-0.5 text-xs font-medium">
                    ✓ Uploaded
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-10 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <div className="text-3xl mb-2">📷</div>
                <p className="text-sm font-medium text-gray-700">Click to upload a photo</p>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG · Max 10 MB</p>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />

            {imageError && (
              <p className="text-xs text-red-600 mt-2">{imageError}</p>
            )}
          </div>

          {/* Step 2 — Location */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              Step 2 — Set Location
            </h2>

            {location ? (
              <div className="flex items-start justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-green-800">Location captured</p>
                  {locationAddress && (
                    <p className="text-xs text-green-700 mt-0.5 leading-snug">{locationAddress}</p>
                  )}
                  <p className="text-xs text-green-600 mt-0.5">{locationLabel}</p>
                  {locationZone && (
                    <span className="inline-block mt-1 text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                      Zone: {locationZone.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLocation(null);
                    setLocationLabel("");
                    setLocationAddress(null);
                    setLocationZone(null);
                  }}
                  className="shrink-0 text-xs text-green-700 underline mt-0.5"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={geoLoading}
                className="w-full bg-gray-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {geoLoading ? "Getting location..." : "📍  Use my current location"}
              </button>
            )}
          </div>

          {/* Step 3 — Description */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              Step 3 — Description{" "}
              <span className="font-normal text-gray-400">(Optional)</span>
            </h2>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 200))}
              placeholder="Add any context the AI should know..."
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-black bg-white placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/200</p>
          </div>

          {/* Step 4 — Nearby Context */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">
              Step 4 — Nearby Context{" "}
              <span className="font-normal text-gray-400">(Optional)</span>
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              Add nearby facilities or area context to improve impact assessment.
            </p>
            <select
              value={contextHint}
              onChange={(e) => { setContextHint(e.target.value); if (e.target.value !== "Other") setCustomContext(""); }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
            >
              <option value="None">None</option>
              <option value="Hospital">🏥 Hospital</option>
              <option value="School">🏫 School</option>
              <option value="College / University">🎓 College / University</option>
              <option value="IT Park">💻 IT Park</option>
              <option value="Bus Stand">🚌 Bus Stand</option>
              <option value="Railway Station">🚉 Railway Station</option>
              <option value="Government Office">🏛️ Government Office</option>
              <option value="Market Area">🛒 Market Area</option>
              <option value="Residential Colony">🏠 Residential Colony</option>
              <option value="Industrial Facility">🏭 Industrial Facility</option>
              <option value="Other">✏️ Other (type below)</option>
            </select>
            {contextHint === "Other" && (
              <input
                type="text"
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value.slice(0, 80))}
                placeholder="Describe nearby landmark (e.g. IITM Research Park)"
                className="w-full mt-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-lg border border-red-100">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full bg-blue-600 text-white rounded-xl px-4 py-3.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting
              ? "Analyzing your report..."
              : imageUploading
              ? "Waiting for image upload..."
              : "Submit Report"}
          </button>
        </div>
      </div>
    </div>
  );
}
