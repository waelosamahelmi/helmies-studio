"use client";

export default function PhoneLoadingScreen({ stage = "Generating", progress }) {
  return (
    <div className="ph-loading-screen">
      <div className="ph-loading-core">
        <div className="ph-loading-core-inner">
          {progress != null ? (
            <strong>{Math.round(progress)}%</strong>
          ) : (
            <strong>{stage}</strong>
          )}
          <small>rendering</small>
        </div>
      </div>
      <div className="ph-loading-label">{stage}...</div>
    </div>
  );
}
