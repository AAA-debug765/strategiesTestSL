import { NextResponse } from "next/server";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

export async function GET() {
  let commit = "unknown";
  let time = "";
  try {
    commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    const ts = execSync("git log -1 --format=%ct", { encoding: "utf-8" }).trim();
    const d = new Date(parseInt(ts) * 1000);
    time = d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  } catch {
    // fallback
  }
  return NextResponse.json({ commit, time });
}