import { NextRequest } from "next/server";
import { getOptJob } from "../route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId is required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const job = getOptJob(jobId);
  if (!job) {
    return new Response(JSON.stringify({ error: "Job not found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(job), {
    headers: { "Content-Type": "application/json" },
  });
}