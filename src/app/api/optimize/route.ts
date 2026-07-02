import { NextRequest } from "next/server";
import { startOptimization, cancelOptimization, getOptJob } from "@/lib/optimizer";
import { getStrategy } from "@/strategies";

// Connect optimizer's strategy resolver to our registry
import { setStrategyResolver } from "@/lib/optimizer";
setStrategyResolver(getStrategy);

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = startOptimization(body);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg.includes("not found") ? 404 : 400;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { "Content-Type": "application/json" },
    });
  }
}

export async function DELETE(request: NextRequest) {
  const jobId = new URL(request.url).searchParams.get("jobId");
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

  const results = cancelOptimization(jobId);
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
}