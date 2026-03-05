import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
export const UploadsPage = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [jobs, setJobs] = useState([]);
    const intervalRef = useRef(null);
    const pollJobs = async () => {
        const pending = jobs.filter((job) => job.status === "QUEUED" || job.status === "PROCESSING");
        if (pending.length === 0)
            return;
        const updated = await Promise.all(jobs.map(async (job) => {
            if (job.status !== "QUEUED" && job.status !== "PROCESSING")
                return job;
            const response = await apiFetch(`/api/v1/import-jobs/${job.id}`);
            return {
                id: response.id,
                status: response.status,
                error: response.error,
                result: response.result
            };
        }));
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
            if (intervalRef.current)
                window.clearInterval(intervalRef.current);
        };
    }, [jobs]);
    return (_jsxs("div", { className: "stack", children: [_jsx("h2", { children: "Uploads" }), _jsxs("div", { className: "card stack", children: [_jsx("input", { type: "file", accept: ".epub,.pdf", onChange: (event) => setSelectedFile(event.target.files?.[0] ?? null) }), _jsx("button", { onClick: async () => {
                            if (!selectedFile)
                                return;
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
                            const payload = (await response.json());
                            setJobs((prev) => [{ id: payload.jobId, status: payload.status }, ...prev]);
                            setSelectedFile(null);
                        }, children: "Upload" })] }), _jsx("div", { className: "stack", children: jobs.map((job) => (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "toolbar", children: [_jsxs("strong", { children: ["Job ", job.id] }), _jsx("span", { className: "badge", children: job.status })] }), job.error && _jsx("p", { style: { color: "#b42318" }, children: job.error }), job.result?.bookId && _jsxs("p", { className: "small", children: ["Book ID: ", job.result.bookId] })] }, job.id))) })] }));
};
