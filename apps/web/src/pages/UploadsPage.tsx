import React, { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

interface UploadJob {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  error?: string | null;
  result?: { bookId?: number } | null;
}

export const UploadsPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const intervalRef = useRef<number | null>(null);

  const pollJobs = async () => {
    const pending = jobs.filter((job) => job.status === "QUEUED" || job.status === "PROCESSING");
    if (pending.length === 0) return;

    const updated = await Promise.all(
      jobs.map(async (job) => {
        if (job.status !== "QUEUED" && job.status !== "PROCESSING") return job;
        const response = await apiFetch<any>(`/api/v1/import-jobs/${job.id}`);
        return {
          id: response.id,
          status: response.status,
          error: response.error,
          result: response.result
        } as UploadJob;
      })
    );

    setJobs(updated);
  };

  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (jobs.some((job) => job.status === "QUEUED" || job.status === "PROCESSING")) {
      intervalRef.current = window.setInterval(() => {
        void pollJobs();
      }, 1800);
    }

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [jobs]);

  return (
    <div className="stack">
      <h2>Uploads</h2>
      <div className="card stack">
        <input
          type="file"
          accept=".epub,.pdf"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
        />
        <button
          onClick={async () => {
            if (!selectedFile) return;
            const formData = new FormData();
            formData.append("file", selectedFile);

            const response = await fetch("/api/v1/uploads", {
              method: "POST",
              headers: {
                authorization: `Bearer ${JSON.parse(localStorage.getItem("booklite_tokens") || "{}").accessToken ?? ""}`
              },
              body: formData
            });

            if (!response.ok) {
              alert("Upload failed");
              return;
            }

            const payload = (await response.json()) as { jobId: string; status: UploadJob["status"] };
            setJobs((prev) => [{ id: payload.jobId, status: payload.status }, ...prev]);
            setSelectedFile(null);
          }}
        >
          Upload
        </button>
      </div>

      <div className="stack">
        {jobs.map((job) => (
          <div className="card" key={job.id}>
            <div className="toolbar">
              <strong>Job {job.id}</strong>
              <span className="badge">{job.status}</span>
            </div>
            {job.error && <p style={{ color: "#b42318" }}>{job.error}</p>}
            {job.result?.bookId && <p className="small">Book ID: {job.result.bookId}</p>}
          </div>
        ))}
      </div>
    </div>
  );
};
